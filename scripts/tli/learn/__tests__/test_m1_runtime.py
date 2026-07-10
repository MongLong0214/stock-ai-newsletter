from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_runtime import (
    EXPECTED_SCRIPT_LOCK_SHA256,
    REQUIRED_PACKAGE_VERSIONS,
    REQUIRED_THREAD_ENV,
    RuntimeContext,
    check_runtime_contract,
    probe_runtime_context,
)


def compliant_context(**overrides: object) -> RuntimeContext:
    base = {
        "uv_version": "0.9.25",
        "python_version": "3.13.11",
        "python_implementation": "CPython",
        "package_versions": dict(REQUIRED_PACKAGE_VERSIONS),
        "thread_env": dict(REQUIRED_THREAD_ENV),
        "script_lock_sha256": EXPECTED_SCRIPT_LOCK_SHA256,
        "training_code_git_sha": "0" * 40,
    }
    base.update(overrides)
    return RuntimeContext(**base)  # type: ignore[arg-type]


def test_compliant_runtime_has_no_violations() -> None:
    assert check_runtime_contract(compliant_context()) == ()


def test_python_311_is_rejected_before_training() -> None:
    violations = check_runtime_contract(compliant_context(python_version="3.11.9"))
    assert any("python_version=3.11.9" in violation for violation in violations)


def test_unpinned_dependency_is_rejected_before_training() -> None:
    packages = dict(REQUIRED_PACKAGE_VERSIONS)
    packages["scikit-learn"] = "1.8.2"
    violations = check_runtime_contract(compliant_context(package_versions=packages))
    assert any("package_unpinned: scikit-learn==1.8.2" in violation for violation in violations)


def test_missing_dependency_is_rejected_before_training() -> None:
    packages = dict(REQUIRED_PACKAGE_VERSIONS)
    del packages["numpy"]
    violations = check_runtime_contract(compliant_context(package_versions=packages))
    assert any("package_missing: numpy==2.5.1" in violation for violation in violations)


def test_script_lock_drift_is_rejected_before_training() -> None:
    violations = check_runtime_contract(compliant_context(script_lock_sha256="deadbeef"))
    assert any(violation.startswith("script_lock_drift: deadbeef") for violation in violations)


def test_missing_script_lock_is_rejected_before_training() -> None:
    violations = check_runtime_contract(compliant_context(script_lock_sha256=None))
    assert any("script_lock_missing" in violation for violation in violations)


@pytest.mark.parametrize("thread_var", sorted(REQUIRED_THREAD_ENV))
def test_blas_multi_thread_guard_rejects_each_thread_var(thread_var: str) -> None:
    thread_env = dict(REQUIRED_THREAD_ENV)
    thread_env[thread_var] = "8"
    violations = check_runtime_contract(compliant_context(thread_env=thread_env))
    assert any(f"thread_env: {thread_var}='8'" in violation for violation in violations)


def test_unset_thread_env_is_rejected() -> None:
    violations = check_runtime_contract(compliant_context(thread_env={}))
    assert len([v for v in violations if v.startswith("thread_env:")]) == len(REQUIRED_THREAD_ENV)


def test_running_outside_uv_is_rejected() -> None:
    violations = check_runtime_contract(compliant_context(uv_version=None))
    assert any("uv_not_detected" in violation for violation in violations)


def test_wrong_uv_version_is_rejected() -> None:
    violations = check_runtime_contract(compliant_context(uv_version="0.8.0"))
    assert any("uv_version=0.8.0" in violation for violation in violations)


def test_missing_training_code_git_sha_is_rejected() -> None:
    violations = check_runtime_contract(compliant_context(training_code_git_sha=None))
    assert any("training_code_git_sha_unavailable" in violation for violation in violations)


def test_probe_reports_the_committed_lockfile_hash() -> None:
    assert probe_runtime_context().script_lock_sha256 == EXPECTED_SCRIPT_LOCK_SHA256
