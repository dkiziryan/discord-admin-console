import { useEffect, useMemo, useState } from "react";

import type { CsvFileMetadata, CsvRowsResponse } from "../../models/types";
import {
  deleteCsvFile,
  fetchCsvFiles,
  fetchCsvRows,
} from "../../services/csv/csvFiles";
import { formatJobDate, formatJobStatus, formatJobType } from "../../utils/jobHistory";

const CSV_LIST_PAGE_SIZE = 10;
const CSV_ROWS_PAGE_SIZE = 25;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type CsvDateFilter = "all" | "7d" | "30d";

export const DATE_FILTER_OPTIONS: { label: string; value: CsvDateFilter }[] = [
  { label: "All dates", value: "all" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

export const useCsvExports = () => {
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
  const showFilePagination = filteredFiles.length > CSV_LIST_PAGE_SIZE;
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

  const handleWorkflowFilterChange = (value: string) => {
    setWorkflowFilter(value);
    setFilePage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setFilePage(1);
  };

  const handleDateFilterChange = (value: CsvDateFilter) => {
    setDateFilter(value);
    setFilePage(1);
  };

  const handlePreviousFilePage = () => {
    setFilePage((current) => Math.max(1, current - 1));
  };

  const handleNextFilePage = () => {
    setFilePage((current) => Math.min(totalFilePages, current + 1));
  };

  const handlePreviousRowsPage = () => {
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNextRowsPage = () => {
    if (!csvRows) {
      return;
    }

    setPage((current) => Math.min(csvRows.totalPages, current + 1));
  };

  const cancelDelete = () => {
    if (!deletingFilename) {
      setDeleteCandidateFilename(null);
    }
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

  return {
    cancelDelete,
    clearFileFilters,
    csvRows,
    dateFilter,
    deleteCandidateFilename,
    deletingFilename,
    errorMessage,
    fileEnd,
    filePage,
    fileStart,
    files,
    filteredFiles,
    handleDateFilterChange,
    handleDeleteFile,
    handleNextFilePage,
    handleNextRowsPage,
    handlePreviousFilePage,
    handlePreviousRowsPage,
    handleSearch,
    handleSelectFile,
    handleStatusFilterChange,
    handleWorkflowFilterChange,
    hasActiveFileFilters,
    loadingFiles,
    loadingRows,
    refreshFiles,
    search,
    selectedFile,
    selectedFilename,
    setDeleteCandidateFilename,
    showFilePagination,
    statusFilter,
    statusMessage,
    statusOptions,
    totalFilePages,
    visibleFiles,
    workflowFilter,
    workflowOptions,
  };
};

export const formatCsvFileDetail = (file: CsvFileMetadata): string => {
  const modifiedAt = formatJobDate(file.modifiedAt);
  const size = formatBytes(file.size);
  const rowDetail =
    typeof file.rowCount === "number"
      ? `${file.rowCount} row${file.rowCount === 1 ? "" : "s"}`
      : size;

  return `${rowDetail} · ${modifiedAt}`;
};

export const formatCsvStatus = (status: string): string => {
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
