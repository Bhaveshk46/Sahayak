import { FormField } from '../types';
import { ProfileRecord } from '../types/profile';
import { PortalValidationError } from './errorScanner';
import { fillFieldWithRetry } from '../fillers/formFiller';
import { matchOptionValue } from '../decide/valueFormatter';

export interface RecoveryContext {
  doc: Document;
  fields: FormField[];
  profileRecords: ProfileRecord[];
  attachedFiles?: Map<string, File>; // slotId -> current attached File
  onReattachNeeded?: (slotElement: HTMLElement, file: File) => Promise<boolean>;
}

export interface RecoveryActionResult {
  recovered: boolean;
  needsYou: boolean;
  actionTaken?: string;
  fieldId?: string;
  exactPortalMessage: string;
}

export class RecoveryEngine {
  private retryCounts: Map<string, number> = new Map();
  private maxRetriesPerField: number = 1;

  public canRetry(fieldId: string): boolean {
    const current = this.retryCounts.get(fieldId) || 0;
    return current < this.maxRetriesPerField;
  }

  public getRetryCount(fieldId: string): number {
    return this.retryCounts.get(fieldId) || 0;
  }

  public resetHistory(): void {
    this.retryCounts.clear();
  }

  /**
   * Attempts automatic recovery for a validation error ONCE.
   * If error persists or cannot be resolved, marks field as "needs-you" with exact portal message.
   * Never loops.
   */
  public async attemptAutoRecovery(
    error: PortalValidationError,
    context: RecoveryContext
  ): Promise<RecoveryActionResult> {
    const fieldId = error.fieldId || error.associatedInput?.id || 'unknown';

    // Rule: Never retry more than once per field (Requirement 4)
    if (!this.canRetry(fieldId)) {
      return {
        recovered: false,
        needsYou: true,
        fieldId,
        exactPortalMessage: error.errorText,
        actionTaken: `Single auto-recovery retry previously attempted for ${fieldId}. Handing back to user.`,
      };
    }

    this.retryCounts.set(fieldId, (this.retryCounts.get(fieldId) || 0) + 1);

    const targetField = context.fields.find((f) => f.id === fieldId || f.selector.includes(fieldId));

    switch (error.errorType) {
      case 'EMPTY_REQUIRED': {
        // Obvious fix: Re-fill empty required field from profile
        const profileMatch = context.profileRecords.find(
          (r) =>
            r.key.toLowerCase() === targetField?.name?.toLowerCase() ||
            targetField?.label?.toLowerCase().includes(r.key.toLowerCase())
        );

        if (profileMatch?.value && targetField) {
          const fillRes = await fillFieldWithRetry(targetField, profileMatch.value, context.doc, 1);
          if (fillRes.ok) {
            return {
              recovered: true,
              needsYou: false,
              fieldId,
              exactPortalMessage: error.errorText,
              actionTaken: `Auto-refilled required field "${targetField.label}" with profile value.`,
            };
          }
        }
        break;
      }

      case 'INVALID_DATE': {
        // Obvious fix: Try alternate date format (DD-MM-YYYY vs YYYY-MM-DD)
        const dateInput = (error.associatedInput as HTMLInputElement) || context.doc.getElementById(fieldId);
        if (dateInput && targetField) {
          const currentVal = dateInput.value;
          let altVal = '';

          // If current is YYYY-MM-DD -> convert to DD-MM-YYYY
          if (/^\d{4}-\d{2}-\d{2}$/.test(currentVal)) {
            const [y, m, d] = currentVal.split('-');
            altVal = `${d}-${m}-${y}`;
          } else if (/^\d{2}-\d{2}-\d{4}$/.test(currentVal)) {
            const [d, m, y] = currentVal.split('-');
            altVal = `${y}-${m}-${d}`;
          }

          if (altVal) {
            const fillRes = await fillFieldWithRetry(targetField, altVal, context.doc, 1);
            if (fillRes.ok) {
              return {
                recovered: true,
                needsYou: false,
                fieldId,
                exactPortalMessage: error.errorText,
                actionTaken: `Re-formatted date from "${currentVal}" to "${altVal}".`,
              };
            }
          }
        }
        break;
      }

      case 'INVALID_OPTION': {
        // Obvious fix: Try alternative option format (value vs label)
        if (targetField?.options && targetField.options.length > 0) {
          const profileVal = context.profileRecords.find((r) => r.key === targetField.name)?.value || '';
          if (profileVal) {
            const matchedOpt = matchOptionValue(profileVal, targetField.options);
            if (matchedOpt.value && !matchedOpt.needsReview) {
              const fillRes = await fillFieldWithRetry(targetField, matchedOpt.value, context.doc, 1);
              if (fillRes.ok) {
                return {
                  recovered: true,
                  needsYou: false,
                  fieldId,
                  exactPortalMessage: error.errorText,
                  actionTaken: `Re-selected option "${matchedOpt.value}" to match portal format.`,
                };
              }
            }
          }
        }
        break;
      }

      case 'FILE_TOO_LARGE': {
        // Handled via tighter compression in QuickAttachManager
        return {
          recovered: false,
          needsYou: true,
          fieldId,
          exactPortalMessage: error.errorText,
          actionTaken: 'File size limit exceeded on portal. Quick-attach configured with tighter limit.',
        };
      }

      default:
        break;
    }

    // Default: Mark as needs-you with exact portal message
    return {
      recovered: false,
      needsYou: true,
      fieldId,
      exactPortalMessage: error.errorText,
      actionTaken: `No automated fix available for "${error.errorText}". Requires user intervention.`,
    };
  }
}

