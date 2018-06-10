
export enum DataErrors {
  LOKI_DIVIDEND_GET_WRITTEN_ON_SHOULD_NOT_BE_USED,
  LOKI_DIVIDEND_REMOVE_BLOCK_SHOULD_NOT_BE_USED,
  NEGATIVE_BALANCE,
  BLOCK_WASNT_COMMITTED,
  CANNOT_ARCHIVE_CHUNK_WRONG_SIZE,
  CORRUPTED_DATABASE,
  BLOCKCHAIN_NOT_INITIALIZED_YET,
  CANNOT_DETERMINATE_MEMBERSHIP_AGE,
  CANNOT_DETERMINATE_IDENTITY_AGE,
  CERT_BASED_ON_UNKNOWN_BLOCK,
  NO_TRANSACTION_POSSIBLE_IF_NOT_CURRENT_BLOCK,
  CANNOT_REAPPLY_NO_CURRENT_BLOCK,
  CANNOT_REVERT_NO_CURRENT_BLOCK,
  BLOCK_TO_REVERT_NOT_FOUND,
  MEMBER_NOT_FOUND
}
