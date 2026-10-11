import type { SVGProps } from "react";

/** A drawn paw print (four toes and a pad) that takes its color from the text. */
export function PawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <ellipse
        cx="5.6"
        cy="11"
        rx="2.1"
        ry="2.9"
        transform="rotate(-20 5.6 11)"
      />
      <ellipse cx="9.8" cy="6.2" rx="2.2" ry="3" />
      <ellipse cx="14.2" cy="6.2" rx="2.2" ry="3" />
      <ellipse
        cx="18.4"
        cy="11"
        rx="2.1"
        ry="2.9"
        transform="rotate(20 18.4 11)"
      />
      <path d="M12 12c-3.1 0-5.7 3-5.7 5.4 0 1.9 1.6 2.6 3.3 2.1.9-.3 1.6-.5 2.4-.5s1.5.2 2.4.5c1.7.5 3.3-.2 3.3-2.1C17.7 15 15.1 12 12 12z" />
    </svg>
  );
}
