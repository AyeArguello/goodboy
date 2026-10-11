import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { IntroLoader } from "./IntroLoader";

function renderLoader() {
  return render(
    <MotionProvider>
      <IntroLoader />
    </MotionProvider>,
  );
}

describe("IntroLoader", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.documentElement.style.overflow = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the logo with the business line underneath", () => {
    renderLoader();

    expect(screen.getByRole("status")).toHaveAccessibleName(
      /peluquería canina/i,
    );
    expect(screen.getByText("Peluquería canina")).toBeInTheDocument();
    expect(screen.getByText("Baño, secado y corte")).toBeInTheDocument();
    expect(
      screen.getByAltText("Good Boy — Peluquería Canina"),
    ).toBeInTheDocument();
  });

  it("locks scrolling while it is up and gives it back when it closes", async () => {
    const user = userEvent.setup();
    renderLoader();
    expect(document.documentElement.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("status"));

    await vi.waitFor(() =>
      expect(document.documentElement.style.overflow).toBe(""),
    );
  });

  it("can be dismissed with the keyboard and is remembered for the session", async () => {
    const user = userEvent.setup();
    renderLoader();

    await user.keyboard("{Escape}");

    await vi.waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(window.sessionStorage.getItem("gb-intro")).toBe("1");
  });

  it("does not play again in a session that already saw it", async () => {
    window.sessionStorage.setItem("gb-intro", "1");
    renderLoader();

    await vi.waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("closes itself after the minimum time once the page has loaded", async () => {
    vi.useFakeTimers();
    renderLoader();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    await vi.waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });
});
