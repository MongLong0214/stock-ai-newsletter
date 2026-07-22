# TLI attention study contract (tli-attention-study-v1)

- study_id: 8c7144f8-f685-4838-8bdc-251f1716e602
- first_origin_date: 2026-07-27 (locked_at은 이 날짜 18:00 KST 이전이어야 하며 lock 시점에 RPC가 강제)
- babl_algorithm_version: comparison-v4-shadow-v1 (lock 시점의 단일 enabled comparison_v4_control row에서 파생)
- label_contract_sha256: SHA-256(git blob HEAD:lib/tli/labels/gt-a-v2.ts) @ 945014a5cef50d6b5db59dc76f5d2a70e320214a
- feature_contract_sha256: SHA-256(git blob HEAD:lib/tli/features/confirmatory-feature-types.ts) @ 945014a5cef50d6b5db59dc76f5d2a70e320214a
- 재현: `git cat-file blob <commit>:<path> | shasum -a 256`

study-contract.json은 canonical-json-v1 bytes 그대로이며 046 `lock_tli_attention_study_contract` RPC가
Git blob 대조 후 append-only로 저장한다. 이 계약은 수정·재발행이 불가능하다.
