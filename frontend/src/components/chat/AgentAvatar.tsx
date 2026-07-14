export function AgentAvatar() {
  return (
    <div className="h-8 w-8 rounded-xl flex-shrink-0 relative group">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-guru/20 to-guru/30 blur-3xl animate-pulse-slow" />
      <div className="relative z-10 flex h-full w-full items-center justify-center bg-gradient-to-br from-guru to-guru/80 rounded-xl border border-guru/20 backdrop-blur-sm shadow-inner hover:shadow-lg transition-shadow">
        <div className="flex h-5 w-5 items-center justify-center font-bold text-white" style={{ fontSize: 10 }}>
          VT
        </div>
      </div>
    </div>
  );
}
