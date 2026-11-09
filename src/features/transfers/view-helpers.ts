import { type TransferItem } from "./controller";
import { shortHash, submissionId } from "./transfers";

export function rowId(hash: string) {
  return `tr-${hash}`;
}

export function cardId(hash: string) {
  return `tc-${hash}`;
}

export function idLabel(item: TransferItem) {
  return item.transferId ?? shortHash(submissionId(item));
}
