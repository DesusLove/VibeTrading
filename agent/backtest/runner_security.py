import ast
import importlib.util
import inspect
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _load_module_from_file(file_path: Path, module_name: str):
    _validate_signal_engine_source(file_path)
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _is_literal_node(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return all(_is_literal_node(item) for item in node.elts)
    if isinstance(node, ast.Dict):
        return all(
            (key is None or _is_literal_node(key)) and _is_literal_node(value)
            for key, value in zip(node.keys, node.values)
        )
    return False


def _is_safe_constant_assignment(node: ast.AST) -> bool:
    if isinstance(node, ast.Assign):
        return _is_literal_node(node.value)
    if isinstance(node, ast.AnnAssign):
        return node.value is None or _is_literal_node(node.value)
    return False


def _is_safe_reference(node: ast.AST | None) -> bool:
    if node is None:
        return True
    if isinstance(node, (ast.Name, ast.Attribute, ast.Constant)):
        return True
    if isinstance(node, ast.Subscript):
        return _is_safe_reference(node.value) and _is_safe_reference(node.slice)
    if isinstance(node, ast.Tuple):
        return all(_is_safe_reference(item) for item in node.elts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return _is_safe_reference(node.left) and _is_safe_reference(node.right)
    return False


def _validate_function_def(node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
    if node.decorator_list:
        raise ValueError(f"Decorators are not allowed on function {node.name!r}")
    for default in [*node.args.defaults, *[d for d in node.args.kw_defaults if d]]:
        if not _is_literal_node(default):
            raise ValueError(f"Non-literal default is not allowed on function {node.name!r}")
    annotations = [node.returns]
    annotations.extend(arg.annotation for arg in node.args.posonlyargs)
    annotations.extend(arg.annotation for arg in node.args.args)
    annotations.extend(arg.annotation for arg in node.args.kwonlyargs)
    annotations.append(node.args.vararg.annotation if node.args.vararg else None)
    annotations.append(node.args.kwarg.annotation if node.args.kwarg else None)
    for annotation in annotations:
        if not _is_safe_reference(annotation):
            raise ValueError(f"Unsafe annotation is not allowed on function {node.name!r}")


def _validate_class_body(node: ast.ClassDef) -> None:
    if node.decorator_list:
        raise ValueError(f"Decorators are not allowed on class {node.name!r}")
    for base in node.bases:
        if not _is_safe_reference(base):
            raise ValueError(f"Unsafe base class is not allowed on class {node.name!r}")
    if node.keywords:
        raise ValueError(f"Class keywords are not allowed on class {node.name!r}")
    for child in node.body:
        if isinstance(child, ast.Expr) and isinstance(child.value, ast.Constant):
            continue
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            _validate_function_def(child)
            continue
        if _is_safe_constant_assignment(child):
            continue
        if isinstance(child, ast.Pass):
            continue
        raise ValueError(
            f"Executable class-level statement {type(child).__name__} is not allowed"
        )


def _validate_signal_engine_source(file_path: Path) -> None:
    try:
        tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    except SyntaxError as exc:
        raise ValueError(f"Invalid signal_engine.py syntax: {exc}") from exc

    for node in tree.body:
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            continue
        if isinstance(node, ast.ImportFrom) and node.module == "signal_engine":
            raise ValueError(
                "Circular import: 'from signal_engine import ...' imports the file from itself. "
                "Remove this import — SignalEngine is defined in this same file."
            )
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            _validate_function_def(node)
            continue
        if isinstance(node, ast.ClassDef):
            _validate_class_body(node)
            continue
        if _is_safe_constant_assignment(node):
            continue
        raise ValueError(
            f"Executable top-level statement {type(node).__name__} is not allowed"
        )


def _validate_signal_engine_class(engine_cls) -> None:
    sig = inspect.signature(engine_cls.__init__)
    required = [
        p.name for p in sig.parameters.values()
        if p.name != "self" and p.default is inspect.Parameter.empty
        and p.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
    ]
    if required:
        raise ValueError(
            f"SignalEngine.__init__() has required arguments {required}. "
            "All parameters must have default values so the runner can call SignalEngine()."
        )
    if not callable(getattr(engine_cls, "generate", None)):
        raise ValueError(
            "SignalEngine must have a callable 'generate' method. "
            "Expected: def generate(self, data_map: Dict[str, pd.DataFrame]) -> Dict[str, pd.Series]"
        )
