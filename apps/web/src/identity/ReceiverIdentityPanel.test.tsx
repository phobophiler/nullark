import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiverIdentityPanel } from "./ReceiverIdentityPanel.js";

describe("ReceiverIdentityPanel", () => {
  it("states that identity creation is local and non-custodial", () => {
    render(<ReceiverIdentityPanel seed="alice-device-seed" />);
    expect(screen.getByText(/created locally/i)).toBeInTheDocument();
    expect(screen.getByText(/server cannot spend/i)).toBeInTheDocument();
  });
});
