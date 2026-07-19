import { useMemo, useState } from "react";

import styles from "./ZeroScanResults.module.css";
import type { ResultsPageProps, ScanResponse } from "../../models/types";
import { CsvDownloadButton } from "../shared/CsvDownloadButton";
import { ResultTile } from "../shared/ResultTile";

const CHANNEL_PREVIEW_LIMIT = 10;
const CHANNEL_PAGE_SIZE = 10;
const EMPTY_CHANNEL_COVERAGE: ScanResponse["data"]["channelCoverage"] = [];

type ResultSubpage = "summary" | "coverage" | "skipped";

export const ZeroScanResults = ({
  result,
  previewLines,
  statusMessage,
  onRunAnotherScan,
}: ResultsPageProps) => {
  const [coverageExpanded, setCoverageExpanded] = useState(true);
  const [skippedExpanded, setSkippedExpanded] = useState(true);
  const [activeSubpage, setActiveSubpage] = useState<ResultSubpage>("summary");
  const [coveragePage, setCoveragePage] = useState(1);
  const [skippedPage, setSkippedPage] = useState(1);
  const { data } = result;
  const previewList = previewLines ?? [];
  const hasPreview = previewList.length > 0;
  const hasProcessedChannels = data.processedChannels.length > 0;
  const hasSkippedChannels = data.skippedChannels.length > 0;
  const excludedCategories = data.excludedCategories ?? [];
  const channelCoverage = data.channelCoverage ?? EMPTY_CHANNEL_COVERAGE;
  const coveragePreview = channelCoverage.slice(0, CHANNEL_PREVIEW_LIMIT);
  const skippedPreview = data.skippedChannels.slice(0, CHANNEL_PREVIEW_LIMIT);
  const coverageHasFullView = channelCoverage.length > CHANNEL_PREVIEW_LIMIT;
  const skippedHasFullView =
    data.skippedChannels.length > CHANNEL_PREVIEW_LIMIT;
  const scanModeLabel = data.scanMode === "fast" ? "Fast (approximate)" : "Exact";
  const excludedCategoryLabel =
    excludedCategories.length > 0
      ? excludedCategories.join(", ")
      : "None";
  const coverageTotalPages = Math.max(
    1,
    Math.ceil(channelCoverage.length / CHANNEL_PAGE_SIZE),
  );
  const skippedTotalPages = Math.max(
    1,
    Math.ceil(data.skippedChannels.length / CHANNEL_PAGE_SIZE),
  );
  const pagedCoverage = useMemo(() => {
    const startIndex = (coveragePage - 1) * CHANNEL_PAGE_SIZE;
    return channelCoverage.slice(startIndex, startIndex + CHANNEL_PAGE_SIZE);
  }, [channelCoverage, coveragePage]);
  const pagedSkippedChannels = useMemo(() => {
    const startIndex = (skippedPage - 1) * CHANNEL_PAGE_SIZE;
    return data.skippedChannels.slice(startIndex, startIndex + CHANNEL_PAGE_SIZE);
  }, [data.skippedChannels, skippedPage]);

  if (activeSubpage === "coverage") {
    return (
      <ChannelCoveragePage
        coverage={pagedCoverage}
        currentPage={coveragePage}
        onBack={() => setActiveSubpage("summary")}
        onNext={() =>
          setCoveragePage((current) => Math.min(coverageTotalPages, current + 1))
        }
        onPrevious={() => setCoveragePage((current) => Math.max(1, current - 1))}
        totalChannels={channelCoverage.length}
        totalPages={coverageTotalPages}
      />
    );
  }

  if (activeSubpage === "skipped") {
    return (
      <SkippedChannelsPage
        channels={pagedSkippedChannels}
        currentPage={skippedPage}
        onBack={() => setActiveSubpage("summary")}
        onNext={() =>
          setSkippedPage((current) => Math.min(skippedTotalPages, current + 1))
        }
        onPrevious={() => setSkippedPage((current) => Math.max(1, current - 1))}
        totalChannels={data.skippedChannels.length}
        totalPages={skippedTotalPages}
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2>Scan results</h2>
          <p className={styles.subtitle}>
            CSV saved to <code>{data.csvPath}</code>
          </p>
        </div>
        <div className={styles.actions}>
          <CsvDownloadButton filename={data.csvPath} />
          <button type="button" className="secondary-button" onClick={onRunAnotherScan}>
            Run another scan
          </button>
        </div>
      </div>

      {statusMessage && <p className={`status success ${styles.status}`}>{statusMessage}</p>}
      {data.coverageWarning && (
        <p className={`status error ${styles.status}`}>{data.coverageWarning}</p>
      )}

      <div className="result-grid">
        <ResultTile label="Guild" value={data.guildName} />
        <ResultTile label="Zero-message users" value={data.zeroMessageCount} />
        <ResultTile label="Members checked" value={data.totalMembersChecked} />
        <ResultTile label="Messages scanned" value={data.totalMessagesScanned} />
        <ResultTile label="Scan mode" value={scanModeLabel} />
      </div>

      <div className={styles.details}>
        <article className={styles.card}>
          <h3>Zero-message preview</h3>
          {hasPreview ? (
            <ul>
              {previewList.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {data.zeroMessageCount === 0
                ? "Everyone has posted in the selected channels."
                : "No preview available for the current selection."}
            </p>
          )}
        </article>

        <article className={styles.card}>
          <h3>Channel summary</h3>
          <p className={styles.empty}>
            Excluded categories: {excludedCategoryLabel}
          </p>
          {channelCoverage.length > 0 && (
            <div className={styles.channelColumn}>
              <div className={styles.sectionHeader}>
                <h4>Coverage</h4>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCoverageExpanded((current) => !current)}
                >
                  {coverageExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              {coverageExpanded && (
                <>
                  <ul>
                    {coveragePreview.map((coverage) => (
                      <CoverageListItem
                        coverage={coverage}
                        key={coverage.channelName}
                      />
                    ))}
                  </ul>
                  {coverageHasFullView && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setCoveragePage(1);
                        setActiveSubpage("coverage");
                      }}
                    >
                      View full coverage
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <div className={styles.channels}>
            <div className={styles.channelColumn}>
              <h4>Processed</h4>
              {hasProcessedChannels ? (
                <ul>
                  {data.processedChannels.map((channel) => (
                    <li key={channel}>{channel}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No channels processed.</p>
              )}
            </div>
            <div className={styles.channelColumn}>
              <div className={styles.sectionHeader}>
                <h4>Skipped</h4>
                {hasSkippedChannels && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSkippedExpanded((current) => !current)}
                  >
                    {skippedExpanded ? "Collapse" : "Expand"}
                  </button>
                )}
              </div>
              {hasSkippedChannels ? (
                skippedExpanded && (
                  <>
                    <ul>
                      {skippedPreview.map((channel) => (
                        <li key={channel}>{channel}</li>
                      ))}
                    </ul>
                    {skippedHasFullView && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setSkippedPage(1);
                          setActiveSubpage("skipped");
                        }}
                      >
                        View full skipped
                      </button>
                    )}
                  </>
                )
              ) : (
                <p className={styles.empty}>No channels were skipped.</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
};

type ChannelCoverage = ScanResponse["data"]["channelCoverage"][number];

const ChannelCoveragePage = ({
  coverage,
  currentPage,
  onBack,
  onNext,
  onPrevious,
  totalChannels,
  totalPages,
}: {
  coverage: ChannelCoverage[];
  currentPage: number;
  onBack: () => void;
  onNext: () => void;
  onPrevious: () => void;
  totalChannels: number;
  totalPages: number;
}) => (
  <section className={styles.page}>
    <div className={styles.header}>
      <div>
        <h2>Full channel coverage</h2>
        <p className={styles.subtitle}>{totalChannels} covered channels</p>
      </div>
      <button type="button" className="secondary-button" onClick={onBack}>
        Back to scan results
      </button>
    </div>
    <div className={styles.card}>
      <ul>
        {coverage.map((item) => (
          <CoverageListItem coverage={item} key={item.channelName} />
        ))}
      </ul>
      <PaginationControls
        currentPage={currentPage}
        onNext={onNext}
        onPrevious={onPrevious}
        totalPages={totalPages}
      />
    </div>
  </section>
);

const SkippedChannelsPage = ({
  channels,
  currentPage,
  onBack,
  onNext,
  onPrevious,
  totalChannels,
  totalPages,
}: {
  channels: string[];
  currentPage: number;
  onBack: () => void;
  onNext: () => void;
  onPrevious: () => void;
  totalChannels: number;
  totalPages: number;
}) => (
  <section className={styles.page}>
    <div className={styles.header}>
      <div>
        <h2>Full skipped channels</h2>
        <p className={styles.subtitle}>{totalChannels} skipped channels</p>
      </div>
      <button type="button" className="secondary-button" onClick={onBack}>
        Back to scan results
      </button>
    </div>
    <div className={styles.card}>
      <ul>
        {channels.map((channel) => (
          <li key={channel}>{channel}</li>
        ))}
      </ul>
      <PaginationControls
        currentPage={currentPage}
        onNext={onNext}
        onPrevious={onPrevious}
        totalPages={totalPages}
      />
    </div>
  </section>
);

const CoverageListItem = ({ coverage }: { coverage: ChannelCoverage }) => (
  <li>
    {coverage.channelName}: {coverage.messagesScanned} messages scanned
    {coverage.oldestMessageAt
      ? `, oldest ${new Date(coverage.oldestMessageAt).toLocaleDateString()}`
      : ""}
    {coverage.reachedMessageLimit ? " (fast limit reached)" : ""}
  </li>
);

const PaginationControls = ({
  currentPage,
  onNext,
  onPrevious,
  totalPages,
}: {
  currentPage: number;
  onNext: () => void;
  onPrevious: () => void;
  totalPages: number;
}) => (
  <div className={styles.pagination}>
    <button
      type="button"
      className="secondary-button"
      disabled={currentPage <= 1}
      onClick={onPrevious}
    >
      Previous
    </button>
    <span className={styles.pageCount}>
      Page {currentPage} of {totalPages}
    </span>
    <button
      type="button"
      className="secondary-button"
      disabled={currentPage >= totalPages}
      onClick={onNext}
    >
      Next
    </button>
  </div>
);
