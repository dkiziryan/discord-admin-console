import type { UpdateMemberRolesRequest, UpdateMemberRolesResponse } from "../../models/types";

export const MemberRoleScanBreakdown = ({ data, action }: {
  data: UpdateMemberRolesResponse["data"];
  action: UpdateMemberRolesRequest["action"];
}) => (
  <section aria-label="Member scan breakdown">
    <h4>Member scan breakdown</h4>
    <ul>
      <li>Members checked: {data.totalMembers}</li>
      <li>Matching members needing a change: {data.matchedCount}</li>
      {data.scanSummary && <>
        <li>Bots excluded: {data.scanSummary.bots}</li>
        <li>Excluded by selected roles: {data.scanSummary.excludedByRole}</li>
        <li>{action === "add" ? "Already have the role" : "Do not have the role"}: {data.scanSummary.noChangeNeeded}</li>
        <li>Member pages read: {data.scanSummary.pagesRead}</li>
      </>}
    </ul>
  </section>
);
