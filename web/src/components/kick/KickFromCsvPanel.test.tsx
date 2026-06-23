// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KickFromCsvPanel } from "./KickFromCsvPanel";
import { deleteCsvFile, fetchCsvFiles } from "../../services/csv/csvFiles";
import { kickFromCsv } from "../../services/csv/kickFromCsv";
import type { CsvFileMetadata } from "../../models/types";

vi.mock("../../services/csv/csvFiles", () => ({
  buildCsvDownloadUrl: (filename: string) =>
    `/api/csv-files/${encodeURIComponent(filename)}/download`,
  deleteCsvFile: vi.fn(),
  fetchCsvFiles: vi.fn(),
}));

vi.mock("../../services/csv/kickFromCsv", () => ({
  kickFromCsv: vi.fn(),
}));

vi.mock("../../services/csv/cancelKick", () => ({
  cancelKickJob: vi.fn(),
}));

const csvFile = (filename: string): CsvFileMetadata => ({
  filename,
  modifiedAt: "2026-05-21T12:00:00.000Z",
  size: 128,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KickFromCsvPanel", () => {
  it("confirms and deletes a CSV export through the shared modal", async () => {
    vi.mocked(fetchCsvFiles)
      .mockResolvedValueOnce([csvFile("users.csv")])
      .mockResolvedValueOnce([]);
    vi.mocked(deleteCsvFile).mockResolvedValue();

    render(<KickFromCsvPanel />);

    expect(await screen.findByText("users.csv")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Delete users.csv"));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText("Are you sure you want to delete users.csv?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete CSV" }));

    await waitFor(() => {
      expect(deleteCsvFile).toHaveBeenCalledWith("users.csv");
    });
    expect(await screen.findByText("CSV export deleted.")).toBeTruthy();
    expect(
      screen.getByText("No CSV exports found in the csv/ directory."),
    ).toBeTruthy();
  });

  it("requires the selected file count before live kicking users", async () => {
    vi.mocked(fetchCsvFiles).mockResolvedValue([csvFile("users.csv")]);
    vi.mocked(kickFromCsv).mockResolvedValue({
      message: "Kick job finished for 1 file(s).",
      results: [],
    });

    render(<KickFromCsvPanel />);

    expect(await screen.findByText("users.csv")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /users.csv/ }));
    fireEvent.click(screen.getByLabelText(/Dry run/));
    fireEvent.click(screen.getByRole("button", { name: "Kick selected users" }));

    const confirmButton = await screen.findByRole("button", {
      name: "Kick users",
    });
    expect(confirmButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Selected file count confirmation"), {
      target: { value: "1" },
    });
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(kickFromCsv).toHaveBeenCalledWith({
        filenames: ["users.csv"],
        dryRun: false,
      });
    });
  });
});
