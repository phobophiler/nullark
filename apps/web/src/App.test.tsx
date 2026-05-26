import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import { createFinalMainnetProductRuntimeConfig, setProductRuntimeConfigForTests } from "./product/productRuntimeConfig.js";

beforeEach(() => {
  setProductRuntimeConfigForTests(createFinalMainnetProductRuntimeConfig());
});

afterEach(() => {
  cleanup();
  setProductRuntimeConfigForTests(null);
});

describe("App", () => {
  it("renders the Nullark shielded transfer shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Nullark Transfer Console" })).toBeInTheDocument();
    expect(screen.getByLabelText("Network")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Nullark shielded MegaETH console" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nullark console status")).toBeInTheDocument();
    expect(screen.getByAltText("MegaETH")).toHaveAttribute("src", "/assets/megaeth-wordmark.svg");
    expect(screen.getAllByText("MegaETH").length).toBeGreaterThan(0);
    expect(screen.queryByText("MegaETH Mainnet")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Console sections" })).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp("MODE: LIVE" + " UI"))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp("BRAND: NULL" + "ARK"))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp("MegaETH TEST" + "NET"))).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: new RegExp("\\[RABBIT" + "HOLE\\]") })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "[DOCS]" })).not.toBeInTheDocument();
  });
});
