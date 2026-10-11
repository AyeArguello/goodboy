import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { MotionProvider } from "./MotionProvider";
import { Reveal } from "./Reveal";

// jsdom has no IntersectionObserver: a stub that never reports intersections.
beforeAll(() => {
  class NeverIntersects {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: NeverIntersects,
  });
});

describe("Reveal", () => {
  it("renders its content at once, so nothing depends on the animation to be readable", () => {
    render(
      <MotionProvider>
        <Reveal delay={0.2}>
          <p>Contenido de la sección</p>
        </Reveal>
      </MotionProvider>,
    );

    expect(screen.getByText("Contenido de la sección")).toBeInTheDocument();
  });

  it("passes the class name to its wrapper", () => {
    const { container } = render(
      <MotionProvider>
        <Reveal className="h-full">
          <span>x</span>
        </Reveal>
      </MotionProvider>,
    );

    expect(container.firstElementChild).toHaveClass("h-full");
  });
});
