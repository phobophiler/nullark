import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivateBalancePanel } from "./PrivateBalancePanel.js";

describe("PrivateBalancePanel", () => {
  it("shows balance derived from decryptable unspent notes", () => {
    render(<PrivateBalancePanel />);
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText(/derived locally from decryptable unspent notes/i)).toBeInTheDocument();
  });
});
