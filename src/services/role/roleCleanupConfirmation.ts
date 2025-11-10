const ACCEPTED_CONFIRMATIONS = new Set(["yes", "y", "no", "n", "cancel"]);

type RoleCleanupConfirmationInput = {
  responseAuthorId: string;
  expectedAuthorId: string;
  responseContent: string;
  responseReferenceMessageId: string | null;
  promptMessageId: string;
};

export const isRoleCleanupConfirmation = (input: RoleCleanupConfirmationInput): boolean => {
  const {
    responseAuthorId,
    expectedAuthorId,
    responseContent,
    responseReferenceMessageId,
    promptMessageId,
  } = input;

  if (responseAuthorId !== expectedAuthorId) {
    return false;
  }

  if (responseReferenceMessageId !== promptMessageId) {
    return false;
  }

  return ACCEPTED_CONFIRMATIONS.has(responseContent.trim().toLowerCase());
};
