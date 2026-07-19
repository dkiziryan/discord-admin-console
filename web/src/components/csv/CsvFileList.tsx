import styles from "./CsvExportsPanel.module.css";
import type { CsvFileMetadata } from "../../models/types";
import { formatJobType } from "../../utils/jobHistory";
import { CsvDownloadButton } from "../shared/CsvDownloadButton";
import {
  DATE_FILTER_OPTIONS,
  type CsvDateFilter,
  formatCsvFileDetail,
  formatCsvStatus,
} from "./useCsvExports";

type CsvFileListProps = {
  dateFilter: CsvDateFilter;
  deletingFilename: string | null;
  fileEnd: number;
  filePage: number;
  fileStart: number;
  files: CsvFileMetadata[];
  filteredFiles: CsvFileMetadata[];
  hasActiveFileFilters: boolean;
  loadingFiles: boolean;
  onClearFilters: () => void;
  onDateFilterChange: (value: CsvDateFilter) => void;
  onDeleteCandidateChange: (filename: string) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onSelectFile: (filename: string) => void;
  onStatusFilterChange: (value: string) => void;
  onWorkflowFilterChange: (value: string) => void;
  selectedFilename: string | null;
  showPagination: boolean;
  statusFilter: string;
  statusOptions: string[];
  totalFilePages: number;
  visibleFiles: CsvFileMetadata[];
  workflowFilter: string;
  workflowOptions: string[];
};

export const CsvFileList = ({
  dateFilter,
  deletingFilename,
  fileEnd,
  filePage,
  fileStart,
  files,
  filteredFiles,
  hasActiveFileFilters,
  loadingFiles,
  onClearFilters,
  onDateFilterChange,
  onDeleteCandidateChange,
  onNextPage,
  onPreviousPage,
  onSelectFile,
  onStatusFilterChange,
  onWorkflowFilterChange,
  selectedFilename,
  showPagination,
  statusFilter,
  statusOptions,
  totalFilePages,
  visibleFiles,
  workflowFilter,
  workflowOptions,
}: CsvFileListProps) => {
  return (
    <aside className={styles.fileList}>
      {files.length > 0 && (
        <div className={styles.filters}>
          <label className={styles.filterControl}>
            Workflow
            <select
              value={workflowFilter}
              onChange={(event) => onWorkflowFilterChange(event.target.value)}
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
              onChange={(event) => onStatusFilterChange(event.target.value)}
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
              onChange={(event) =>
                onDateFilterChange(event.target.value as CsvDateFilter)
              }
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
              onClick={onClearFilters}
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
                  file.filename === selectedFilename ? styles.selectedFile : ""
                }`}
              >
                <button
                  type="button"
                  className={styles.fileButton}
                  onClick={() => onSelectFile(file.filename)}
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
                  onClick={() => onDeleteCandidateChange(file.filename)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {showPagination && (
            <div className={styles.listPagination}>
              <span className={styles.pageCount}>
                {fileStart}-{fileEnd} of {filteredFiles.length}
              </span>
              <button
                type="button"
                aria-label="Previous CSV export page"
                className="secondary-button"
                disabled={filePage <= 1}
                onClick={onPreviousPage}
              >
                Previous
              </button>
              <button
                type="button"
                aria-label="Next CSV export page"
                className="secondary-button"
                disabled={filePage >= totalFilePages}
                onClick={onNextPage}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
