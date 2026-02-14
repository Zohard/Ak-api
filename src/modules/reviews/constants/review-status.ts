/**
 * Review Status Values
 *
 * These status values control the publication and moderation workflow for reviews.
 */

export enum ReviewStatus {
  /**
   * Status 0: Published
   * Review is visible to all users on the site
   */
  PUBLISHED = 0,

  /**
   * Status 1: Pending (first moderation)
   * Review is awaiting initial moderation approval
   * Currently not used - reviews are published by default
   */
  PENDING = 1,

  /**
   * Status 2: Rejected
   * Review has been rejected by a moderator with a reason
   * User can edit and resubmit
   */
  REJECTED = 2,

  /**
   * Status 3: Pending Re-Review
   * Review was rejected and then resubmitted by the user
   * Requires moderator approval before being published again
   * This prevents users from immediately republishing rejected content
   */
  PENDING_RE_REVIEW = 3,
}

/**
 * Helper function to get status label
 */
export function getReviewStatusLabel(status: number): string {
  switch (status) {
    case ReviewStatus.PUBLISHED:
      return 'Publié';
    case ReviewStatus.PENDING:
      return 'En attente';
    case ReviewStatus.REJECTED:
      return 'Rejeté';
    case ReviewStatus.PENDING_RE_REVIEW:
      return 'En attente de re-validation';
    default:
      return 'Inconnu';
  }
}
