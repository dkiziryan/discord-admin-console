import styles from "./CsvExportsPanel.module.css";
import type { CsvFileMetadata, CsvRowsResponse } from "../../models/types";
import { formatJobType } from "../../utils/jobHistory";
import { formatCsvFileDetail, formatCsvStatus } from "./useCsvExports";

type CsvRowsViewerProps = {
  csvRows: CsvRowsResponse | null;
  loadingRows: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  selectedFile: CsvFileMetadata | null;
};

export const CsvRowsViewer = ({
  csvRows,
  loadingRows,
  onNextPage,
  onPreviousPage,
  onSearchChange,
  search,
  selectedFile,
}: CsvRowsViewerProps) => {
  return (
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
                onChange={(event) => onSearchChange(event.target.value)}
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
                  onClick={onPreviousPage}
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
                  onClick={onNextPage}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};
