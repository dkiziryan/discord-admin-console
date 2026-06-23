import { useEffect, useMemo, useState } from "react";

import styles from "./CsvExportsPanel.module.css";
import type { CsvFileMetadata, CsvRowsResponse } from "../../models/types";
import {
  deleteCsvFile,
  fetchCsvFiles,
  fetchCsvRows,
} from "../../services/csv/csvFiles";
import { formatJobDate, formatJobStatus, formatJobType } from "../../utils/jobHistory";
import { CsvDownloadButton } from "../shared/CsvDownloadButton";
import { ConfirmationModal } from "../shared/ConfirmationModal";

const CSV_LIST_PAGE_SIZE = 10;
const CSV_ROWS_PAGE_SIZE = 25;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type CsvDateFilter = "all" | "7d" | "30d";

const DATE_FILTER_OPTIONS: { label: string; value: CsvDateFilter }[] = [
  { label: "All dates", value: "all" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

export const CsvExportsPanel = () => {
  const [files, setFiles] = useState<CsvFileMetadata[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRowsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filePage, setFilePage] = useState(1);
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<CsvDateFilter>("all");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  const [deleteCandidateFilename, setDeleteCandidateFilename] = useState<
    string | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFiles = async () => {
      setLoadingFiles(true);
      setErrorMessage(null);
      try {
        const fetchedFiles = await fetchCsvFiles();
        if (!cancelled) {
          setFiles(fetchedFiles);
          setSelectedFilename((current) =>
            current && fetchedFiles.some((file) => file.filename === current)
              ? current
              : (fetchedFiles[0]?.filename ?? null),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage((error as Error).message);
          setFiles([]);
          setSelectedFilename(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingFiles(false);
        }
      }
    };

    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFiles = async () => {
    setLoadingFiles(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const fetchedFiles = await fetchCsvFiles();
      setFiles(fetchedFiles);
      setSelectedFilename((current) =>
        current && fetchedFiles.some((file) => file.filename === current)
          ? current
          : (fetchedFiles[0]?.filename ?? null),
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
      setFiles([]);
      setSelectedFilename(null);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (!selectedFilename) {
      setCsvRows(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const loadRows = async () => {
        setLoadingRows(true);
        setErrorMessage(null);
        try {
          const rows = await fetchCsvRows({
            filename: selectedFilename,
            page,
            pageSize: CSV_ROWS_PAGE_SIZE,
            search,
          });
          if (!cancelled) {
            setCsvRows(rows);
            if (rows.page !== page) {
              setPage(rows.page);
            }
          }
        } catch (error) {
          if (!cancelled) {
            setErrorMessage((error as Error).message);
            setCsvRows(null);
          }
        } finally {
          if (!cancelled) {
            setLoadingRows(false);
          }
        }
      };

      void loadRows();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [page, search, selectedFilename]);

  const workflowOptions = useMemo(() => {
    return Array.from(
      new Set(files.map((file) => file.jobType).filter(isPresentString)),
    ).sort((first, second) =>
      formatJobType(first).localeCompare(formatJobType(second)),
    );
  }, [files]);
  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(files.map((file) => file.jobStatus).filter(isPresentString)),
    ).sort((first, second) =>
      formatCsvStatus(first).localeCompare(formatCsvStatus(second)),
    );
  }, [files]);
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const matchesWorkflow =
        workflowFilter === "all" || file.jobType === workflowFilter;
      const matchesStatus =
        statusFilter === "all" || file.jobStatus === statusFilter;
      return (
        matchesWorkflow &&
        matchesStatus &&
        matchesDateFilter(file, dateFilter)
      );
    });
  }, [dateFilter, files, statusFilter, workflowFilter]);
  const hasActiveFileFilters =
    workflowFilter !== "all" || statusFilter !== "all" || dateFilter !== "all";
  const selectedFile = useMemo(
    () => files.find((file) => file.filename === selectedFilename) ?? null,
    [files, selectedFilename],
  );
  const totalFilePages = Math.max(
    1,
    Math.ceil(filteredFiles.length / CSV_LIST_PAGE_SIZE),
  );
  const visibleFiles = useMemo(() => {
    const startIndex = (filePage - 1) * CSV_LIST_PAGE_SIZE;
    return filteredFiles.slice(startIndex, startIndex + CSV_LIST_PAGE_SIZE);
  }, [filePage, filteredFiles]);
  const fileStart =
    filteredFiles.length === 0 ? 0 : (filePage - 1) * CSV_LIST_PAGE_SIZE + 1;
  const fileEnd = Math.min(
    filteredFiles.length,
    filePage * CSV_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setFilePage((current) => Math.min(current, totalFilePages));
  }, [totalFilePages]);

  useEffect(() => {
    if (filteredFiles.length === 0) {
      if (selectedFilename) {
        setSelectedFilename(null);
        setCsvRows(null);
      }
      return;
    }

    if (
      !selectedFilename ||
      !filteredFiles.some((file) => file.filename === selectedFilename)
    ) {
      setSelectedFilename(filteredFiles[0].filename);
      setSearch("");
      setPage(1);
      setCsvRows(null);
    }
  }, [filteredFiles, selectedFilename]);

  const handleSelectFile = (filename: string) => {
    setSelectedFilename(filename);
    setSearch("");
    setPage(1);
    setCsvRows(null);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const clearFileFilters = () => {
    setWorkflowFilter("all");
    setStatusFilter("all");
    setDateFilter("all");
    setFilePage(1);
  };

  const handleDeleteFile = async () => {
    const filename = deleteCandidateFilename;
    if (!filename || deletingFilename) {
      return;
    }

    setDeletingFilename(filename);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await deleteCsvFile(filename);
      if (filename === selectedFilename) {
        setSelectedFilename(null);
        setCsvRows(null);
        setSearch("");
        setPage(1);
      }
      await refreshFiles();
      setStatusMessage("CSV export deleted.");
      setDeleteCandidateFilename(null);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setDeletingFilename(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2>CSV exports</h2>
          <p>Review generated exports without downloading the full file.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={refreshFiles}
          disabled={loadingFiles}
        >
          Refresh
        </button>
      </div>

      {statusMessage && <p className="status success">{statusMessage}</p>}
      {errorMessage && <p className="status error">{errorMessage}</p>}

      <div className={styles.layout}>
        <aside className={styles.fileList}>
          {files.length > 0 && (
            <div className={styles.filters}>
              <label className={styles.filterControl}>
                Workflow
                <select
                  value={workflowFilter}
                  onChange={(event) => {
                    setWorkflowFilter(event.target.value);
                    setFilePage(1);
                  }}
                >
                  <option value="all">All workflows</option>
                  {workflowOptions.map((workflow) => (
                    <option key={workflow} value={workflow}>
                      {formatJobType(workflow)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterControl}>
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setFilePage(1);
                  }}
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatCsvStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterControl}>
                Generated
                <select
                  value={dateFilter}
                  onChange={(event) => {
                    setDateFilter(event.target.value as CsvDateFilter);
                    setFilePage(1);
                  }}
                >
                  {DATE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveFileFilters && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearFileFilters}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {loadingFiles ? (
            <p className={styles.empty}>Loading CSV exports...</p>
          ) : files.length === 0 ? (
            <p className={styles.empty}>No CSV exports found.</p>
          ) : filteredFiles.length === 0 ? (
            <p className={styles.empty}>No CSV exports match these filters.</p>
          ) : (
            <>
              <ul>
                {visibleFiles.map((file) => (
                  <li
                    key={file.filename}
                    className={`${styles.fileItem} ${
                      file.filename === selectedFilename
                        ? styles.selectedFile
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.fileButton}
                      onClick={() => handleSelectFile(file.filename)}
                    >
                      <strong>{file.filename}</strong>
                      <small>{formatCsvFileDetail(file)}</small>
                      {(file.jobType || file.jobStatus) && (
                        <span className={styles.fileBadges}>
                          {file.jobType && (
                            <span className={styles.badge}>
                              {formatJobType(file.jobType)}
                            </span>
                          )}
                          {file.jobStatus && (
                            <span className={styles.badge}>
                              {formatCsvStatus(file.jobStatus)}
                            </span>
                          )}
                        </span>
                      )}
                      {file.createdByUsername && (
                        <small>Created by {file.createdByUsername}</small>
                      )}
                    </button>
                    <CsvDownloadButton
                      className={styles.fileDownload}
                      filename={file.filename}
                      iconOnly
                      label={`Download ${file.filename}`}
                      size="compact"
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${file.filename}`}
                      className={`${styles.fileDelete} secondary-button secondary-button--danger`}
                      disabled={deletingFilename === file.filename}
                      onClick={() => setDeleteCandidateFilename(file.filename)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              {filteredFiles.length > CSV_LIST_PAGE_SIZE && (
                <div className={styles.listPagination}>
                  <span className={styles.pageCount}>
                    {fileStart}-{fileEnd} of {filteredFiles.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Previous CSV export page"
                    className="secondary-button"
                    disabled={filePage <= 1}
                    onClick={() =>
                      setFilePage((current) => Math.max(1, current - 1))
                    }
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    aria-label="Next CSV export page"
                    className="secondary-button"
                    disabled={filePage >= totalFilePages}
                    onClick={() =>
                      setFilePage((current) =>
                        Math.min(totalFilePages, current + 1),
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </aside>

        <section className={styles.viewer}>
          {!selectedFile ? (
            <p className={styles.empty}>Select a CSV export to view rows.</p>
          ) : (
            <>
              <div className={styles.viewerHeader}>
                <div>
                  <h3>{selectedFile.filename}</h3>
                  <p>
                    {csvRows
                      ? `${csvRows.totalRows} matching row${
                          csvRows.totalRows === 1 ? "" : "s"
                        }`
                      : "Open the file to load rows"}
                  </p>
                  <div className={styles.viewerMeta}>
                    <span>{formatCsvFileDetail(selectedFile)}</span>
                    {selectedFile.jobType && (
                      <span>{formatJobType(selectedFile.jobType)}</span>
                    )}
                    {selectedFile.jobStatus && (
                      <span>{formatCsvStatus(selectedFile.jobStatus)}</span>
                    )}
                    {selectedFile.createdByUsername && (
                      <span>Created by {selectedFile.createdByUsername}</span>
                    )}
                  </div>
                </div>
                <label className={styles.searchLabel}>
                  Search by name
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => handleSearch(event.target.value)}
                    placeholder="Username"
                  />
                </label>
              </div>

              {loadingRows && <p className={styles.empty}>Loading rows...</p>}
              {!loadingRows && csvRows && csvRows.rows.length === 0 && (
                <p className={styles.empty}>No rows match this search.</p>
              )}
              {!loadingRows && csvRows && csvRows.rows.length > 0 && (
                <>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          {csvRows.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.rows.map((row, rowIndex) => (
                          <tr key={`${csvRows.page}-${rowIndex}`}>
                            {csvRows.columns.map((column) => (
                              <td key={column}>{row[column]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.pagination}>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={csvRows.page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                    >
                      Previous
                    </button>
                    <span className={styles.pageCount}>
                      Page {csvRows.page} of {csvRows.totalPages}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={csvRows.page >= csvRows.totalPages}
                      onClick={() =>
                        setPage((current) =>
                          Math.min(csvRows.totalPages, current + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
      <ConfirmationModal
        confirmLabel="Delete CSV"
        confirmingLabel="Deleting..."
        isConfirming={Boolean(deletingFilename)}
        isOpen={Boolean(deleteCandidateFilename)}
        message={`Are you sure you want to delete ${deleteCandidateFilename ?? "this CSV export"}?`}
        onCancel={() => {
          if (!deletingFilename) {
            setDeleteCandidateFilename(null);
          }
        }}
        onConfirm={() => void handleDeleteFile()}
        title="Delete CSV export"
      />
    </section>
  );
};

const formatCsvFileDetail = (file: CsvFileMetadata): string => {
  const modifiedAt = formatJobDate(file.modifiedAt);
  const size = formatBytes(file.size);
  const rowDetail =
    typeof file.rowCount === "number"
      ? `${file.rowCount} row${file.rowCount === 1 ? "" : "s"}`
      : size;

  return `${rowDetail} · ${modifiedAt}`;
};

const formatCsvStatus = (status: string): string => {
  const label = formatJobStatus(status);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const isPresentString = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const matchesDateFilter = (
  file: CsvFileMetadata,
  dateFilter: CsvDateFilter,
): boolean => {
  if (dateFilter === "all") {
    return true;
  }

  const dateValue = file.jobCreatedAt ?? file.modifiedAt;
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const days = dateFilter === "7d" ? 7 : 30;
  return timestamp >= Date.now() - days * DAY_IN_MS;
};

const formatBytes = (size: number): string => {
  if (!Number.isFinite(size) || size < 0) {
    return "Unknown size";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
};
