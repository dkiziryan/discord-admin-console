export const formatJobType = (type: string): string => {
  switch (type) {
    case "zero_scan":
      return "Zero-message scan";
    case "inactive_scan":
      return "Inactive-member scan";
    case "kick_csv":
      return "Kick from CSV";
    case "cleanup_roles":
      return "Remove empty roles";
    case "archive_channels":
      return "Archive inactive channels";
    case "remove_threads_by_tag":
      return "Remove threads by tag";
    default:
      return "Dashboard action";
  }
};

export const formatJobStatus = (status: string): string => {
  return status.replace(/_/g, " ");
};

export const formatJobDate = (value: string): string => {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};
