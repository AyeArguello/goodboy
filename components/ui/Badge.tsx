/** Small numeric counter badge, e.g. pending-requests count on the admin nav. */
export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="bg-purple flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs text-white">
      {count}
    </span>
  );
}
