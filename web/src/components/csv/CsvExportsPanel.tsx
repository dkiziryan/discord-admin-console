import styles from "./CsvExportsPanel.module.css";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import { CsvFileList } from "./CsvFileList";
import { CsvRowsViewer } from "./CsvRowsViewer";
import { useCsvExports } from "./useCsvExports";

export const CsvExportsPanel = () => {
  const csvExports = useCsvExports();

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
          onClick={csvExports.refreshFiles}
          disabled={csvExports.loadingFiles}
        >
          Refresh
        </button>
      </div>

      {csvExports.statusMessage && (
        <p className="status success">{csvExports.statusMessage}</p>
      )}
      {csvExports.errorMessage && (
        <p className="status error">{csvExports.errorMessage}</p>
      )}

      <div className={styles.layout}>
        <CsvFileList
          dateFilter={csvExports.dateFilter}
          deletingFilename={csvExports.deletingFilename}
          fileEnd={csvExports.fileEnd}
          filePage={csvExports.filePage}
          fileStart={csvExports.fileStart}
          files={csvExports.files}
          filteredFiles={csvExports.filteredFiles}
          hasActiveFileFilters={csvExports.hasActiveFileFilters}
          loadingFiles={csvExports.loadingFiles}
          onClearFilters={csvExports.clearFileFilters}
          onDateFilterChange={csvExports.handleDateFilterChange}
          onDeleteCandidateChange={csvExports.setDeleteCandidateFilename}
          onNextPage={csvExports.handleNextFilePage}
          onPreviousPage={csvExports.handlePreviousFilePage}
          onSelectFile={csvExports.handleSelectFile}
          onStatusFilterChange={csvExports.handleStatusFilterChange}
          onWorkflowFilterChange={csvExports.handleWorkflowFilterChange}
          selectedFilename={csvExports.selectedFilename}
          showPagination={csvExports.showFilePagination}
          statusFilter={csvExports.statusFilter}
          statusOptions={csvExports.statusOptions}
          totalFilePages={csvExports.totalFilePages}
          visibleFiles={csvExports.visibleFiles}
          workflowFilter={csvExports.workflowFilter}
          workflowOptions={csvExports.workflowOptions}
        />

        <CsvRowsViewer
          csvRows={csvExports.csvRows}
          loadingRows={csvExports.loadingRows}
          onNextPage={csvExports.handleNextRowsPage}
          onPreviousPage={csvExports.handlePreviousRowsPage}
          onSearchChange={csvExports.handleSearch}
          search={csvExports.search}
          selectedFile={csvExports.selectedFile}
        />
      </div>
      <ConfirmationModal
        confirmLabel="Delete CSV"
        confirmingLabel="Deleting..."
        isConfirming={Boolean(csvExports.deletingFilename)}
        isOpen={Boolean(csvExports.deleteCandidateFilename)}
        message={`Are you sure you want to delete ${csvExports.deleteCandidateFilename ?? "this CSV export"}?`}
        onCancel={csvExports.cancelDelete}
        onConfirm={() => void csvExports.handleDeleteFile()}
        title="Delete CSV export"
      />
    </section>
  );
};
