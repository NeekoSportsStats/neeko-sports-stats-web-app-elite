export function MinimalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      {children}
    </div>
  );
}
