# Contributing to VibeTrading

Thank you for your interest! This project welcomes contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/VibeTrading.git`
3. Install dev dependencies: `pip install -e ".[dev]"`
4. Create a feature branch: `git checkout -b feat/your-feature`

## Development

### Backend

```bash
ruff check agent/
ruff format agent/
pytest agent/tests/ -q
```

### Frontend

```bash
cd frontend
npm ci
npm run test:run
npm run build
```

## Pull Request Process

1. Keep changes focused — one feature/fix per PR
2. Add tests for new functionality
3. Run linting and tests before pushing
4. Update documentation if needed
5. Use conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`

## Code Style

- Python: follow ruff rules (configured in pyproject.toml)
- TypeScript: `strict: true` — avoid `any` where possible
- Use modern type syntax (`list[str]`, `str | None`) not legacy `typing.Dict`/`Optional`

## Security

Found a security issue? Email desuslove@users.noreply.github.com instead of opening a public issue.
