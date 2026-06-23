// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CsvExportsPanel } from "./CsvExportsPanel";
import {
  deleteCsvFile,
  fetchCsvFiles,
  fetchCsvRows,
} from "../../services/csv/csvFiles";
import type { CsvFileMetadata, CsvRowsResponse } from "../../models/types";

vi.mock("../../services/csv/csvFiles", () => ({
  buildCsvDownloadUrl: (filename: string) =>
    `/api/csv-files/${encodeURIComponent(filename)}/download`,
  deleteCsvFile: vi.fn(),
  fetchCsvFiles: vi.fn(),
  fetchCsvRows: vi.fn(),
}));

const csvRows = (search: string, username: string): CsvRowsResponse => ({
  filename: "inactive-users.csv",
  columns: ["Username"],
  rows: [{ Username: username }],
  page: 1,
  pageSize: 25,
  totalRows: 1,
  totalPages: 1,
  search,
});

const csvFile = (
  filename: string,
  metadata: Partial<CsvFileMetadata> = {},
): CsvFileMetadata => ({
  filename,
  modifiedAt: "2026-05-21T12:00:00.000Z",
  size: 128,
  ...metadata,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("CsvExportsPanel", () => {
  it("loads CSV rows and refreshes the viewer after search input changes", async () => {
    vi.mocked(fetchCsvFiles).mockResolvedValue([
      csvFile("inactive-users.csv"),
    ]);
    vi.mocked(fetchCsvRows).mockImplementation(async ({ search }) =>
      search ? csvRows(search, "Boris") : csvRows("", "Alice"),
    );

    render(<CsvExportsPanel />);

    expect(await screen.findByText("Alice")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search by name"), {
      target: { value: "bor" },
    });

    expect(await screen.findByText("Boris")).toBeTruthy();
    await waitFor(() => {
      expect(fetchCsvRows).toHaveBeenLastCalledWith({
        filename: "inactive-users.csv",
        page: 1,
        pageSize: 25,
        search: "bor",
      });
    });
  });

  it("shows row load errors for the selected export", async () => {
    vi.mocked(fetchCsvFiles).mockResolvedValue([
      csvFile("inactive-users.csv"),
    ]);
    vi.mocked(fetchCsvRows).mockRejectedValue(new Error("Rows unavailable."));

    render(<CsvExportsPanel />);

    expect(await screen.findByText("Rows unavailable.")).toBeTruthy();
  });

  it("pages CSV exports ten at a time", async () => {
    vi.mocked(fetchCsvFiles).mockResolvedValue(
      Array.from({ length: 11 }, (_, index) =>
        csvFile(`export-${index + 1}.csv`),
      ),
    );
    vi.mocked(fetchCsvRows).mockResolvedValue(csvRows("", "Alice"));

    render(<CsvExportsPanel />);

    expect(await screen.findAllByText("export-1.csv")).toHaveLength(2);
    expect(screen.queryByText("export-11.csv")).toBeNull();
    expect(screen.getByText("1-10 of 11")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next CSV export page"));

    expect(await screen.findByText("export-11.csv")).toBeTruthy();
    expect(screen.getByText("11-11 of 11")).toBeTruthy();
  });

  it("filters CSV exports by workflow and status", async () => {
    vi.mocked(fetchCsvFiles).mockResolvedValue([
      csvFile("zero-users.csv", {
        jobCreatedAt: "2026-06-20T12:00:00.000Z",
        jobStatus: "completed",
        jobType: "zero_scan",
        rowCount: 2,
      }),
      csvFile("inactive-users.csv", {
        createdByUsername: "Dana",
        jobCreatedAt: "2026-06-21T12:00:00.000Z",
        jobStatus: "failed",
        jobType: "inactive_scan",
        rowCount: 1,
      }),
    ]);
    vi.mocked(fetchCsvRows).mockImplementation(async ({ filename }) =>
      filename === "inactive-users.csv"
        ? csvRows("", "Inactive user")
        : csvRows("", "Zero user"),
    );

    render(<CsvExportsPanel />);

    expect(await screen.findByText("Zero user")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Workflow"), {
      target: { value: "inactive_scan" },
    });

    expect(await screen.findByText("Inactive user")).toBeTruthy();
    expect(screen.queryByText("zero-users.csv")).toBeNull();
    expect(screen.getAllByText("Inactive-member scan").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Created by Dana").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "completed" },
    });

    expect(
      await screen.findByText("No CSV exports match these filters."),
    ).toBeTruthy();
  });

  it("confirms and deletes a CSV export", async () => {
    vi.mocked(fetchCsvFiles)
      .mockResolvedValueOnce([csvFile("inactive-users.csv")])
      .mockResolvedValueOnce([]);
    vi.mocked(fetchCsvRows).mockResolvedValue(csvRows("", "Alice"));
    vi.mocked(deleteCsvFile).mockResolvedValue();

    render(<CsvExportsPanel />);

    expect(await screen.findAllByText("inactive-users.csv")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Delete inactive-users.csv"));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText("Are you sure you want to delete inactive-users.csv?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete CSV" }));

    await waitFor(() => {
      expect(deleteCsvFile).toHaveBeenCalledWith("inactive-users.csv");
    });
    expect(await screen.findByText("CSV export deleted.")).toBeTruthy();
    expect(screen.getByText("No CSV exports found.")).toBeTruthy();
  });
});
