export const RedirectLoader = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
      <p className="text-sm text-muted-foreground">Redirecting to checkout...</p>
    </div>
  );
};
