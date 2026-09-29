export default function PageFrame({ children, className = "" }) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${className}`.trim()}>{children}</div>
  );
}
