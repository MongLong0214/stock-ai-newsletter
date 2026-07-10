"""M1 학습 런타임 계약 (master plan "첫 confirmatory 모델 계약").

과학 실행은 uv 0.9.25 + CPython 3.13.11 + frozen script lockfile + 고정 hash seed +
BLAS single-thread에서만 허용된다. 위반은 학습이 시작되기 **전에** 전부 수집해 명시적으로
반환하며, 통과한 실행만 model manifest에 runtime/lock/code SHA를 기록한다.
"""

from __future__ import annotations

import hashlib
import os
import platform
import subprocess
from dataclasses import dataclass
from importlib.metadata import distributions
from pathlib import Path
from typing import Final

from pydantic import BaseModel, ConfigDict

REQUIRED_UV_VERSION: Final[str] = "0.9.25"
REQUIRED_PYTHON_VERSION: Final[str] = "3.13.11"
REQUIRED_PYTHON_IMPLEMENTATION: Final[str] = "CPython"

# PEP 723 direct dependency pin과 정확히 일치해야 한다.
REQUIRED_PACKAGE_VERSIONS: Final[dict[str, str]] = {
    "numpy": "2.5.1",
    "pydantic": "2.13.4",
    "scikit-learn": "1.9.0",
    "typer": "0.26.8",
}

# PYTHONHASHSEED는 재현 가능한 해시 순서를, *_NUM_THREADS는 BLAS single-thread를 강제한다.
REQUIRED_THREAD_ENV: Final[dict[str, str]] = {
    "MKL_NUM_THREADS": "1",
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "PYTHONHASHSEED": "0",
}

SCRIPT_LOCK_PATH: Final[Path] = Path(__file__).with_name("train_m1.py.lock")

# `uv lock --script scripts/tli/learn/train_m1.py`(uv 0.9.25) 산출물의 SHA-256.
# lockfile을 재생성하면 이 상수도 함께 갱신해야 한다 (lock drift fail-closed).
EXPECTED_SCRIPT_LOCK_SHA256: Final[str] = "f3ebf669403388c0666c59946110fa67514fb514df35c4ce888707fb21e23273"

TRAINING_CODE_GIT_SHA_ENV: Final[str] = "TLI_TRAINING_CODE_GIT_SHA"


class RuntimeContractError(RuntimeError):
    pass


class RuntimeManifest(BaseModel):
    model_config = ConfigDict(frozen=True)

    uv_version: str
    python_version: str
    python_implementation: str
    os: str
    arch: str
    blas: str
    thread_env: dict[str, str]
    resolved_packages: tuple[str, ...]
    script_lock_sha256: str
    training_code_git_sha: str
    training_code_git_status: str


@dataclass(frozen=True, slots=True)
class RuntimeContext:
    uv_version: str | None
    python_version: str
    python_implementation: str
    package_versions: dict[str, str]
    thread_env: dict[str, str]
    script_lock_sha256: str | None
    training_code_git_sha: str | None


def check_runtime_contract(context: RuntimeContext) -> tuple[str, ...]:
    """계약 위반을 모두 모아 반환한다. 빈 tuple이면 계약 충족."""
    violations: list[str] = []

    if context.uv_version is None:
        violations.append(
            "uv_not_detected: 과학 실행은 `uv run --frozen --python 3.13.11 --script`로만 허용된다"
        )
    elif context.uv_version != REQUIRED_UV_VERSION:
        violations.append(f"uv_version={context.uv_version} != required {REQUIRED_UV_VERSION}")

    if context.python_version != REQUIRED_PYTHON_VERSION:
        violations.append(f"python_version={context.python_version} != required {REQUIRED_PYTHON_VERSION}")

    if context.python_implementation != REQUIRED_PYTHON_IMPLEMENTATION:
        violations.append(
            f"python_implementation={context.python_implementation} != required {REQUIRED_PYTHON_IMPLEMENTATION}"
        )

    for name, required in sorted(REQUIRED_PACKAGE_VERSIONS.items()):
        installed = context.package_versions.get(name)
        if installed is None:
            violations.append(f"package_missing: {name}=={required}")
        elif installed != required:
            violations.append(f"package_unpinned: {name}=={installed} != required {required}")

    for name, required in sorted(REQUIRED_THREAD_ENV.items()):
        actual = context.thread_env.get(name)
        if actual != required:
            violations.append(f"thread_env: {name}={actual!r} != required {required!r}")

    if context.script_lock_sha256 is None:
        violations.append(f"script_lock_missing: {SCRIPT_LOCK_PATH.name}")
    elif context.script_lock_sha256 != EXPECTED_SCRIPT_LOCK_SHA256:
        violations.append(
            f"script_lock_drift: {context.script_lock_sha256} != expected {EXPECTED_SCRIPT_LOCK_SHA256}"
        )

    if context.training_code_git_sha is None:
        violations.append(
            f"training_code_git_sha_unavailable: git rev-parse HEAD 실패, {TRAINING_CODE_GIT_SHA_ENV}로 주입하라"
        )

    return tuple(violations)


def _uv_version() -> str | None:
    """`uv run`은 자신의 실행 경로를 UV 환경변수로 노출한다."""
    uv_binary = os.environ.get("UV")
    if not uv_binary:
        return None
    try:
        completed = subprocess.run([uv_binary, "--version"], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    parts = completed.stdout.split()
    return parts[1] if len(parts) >= 2 else None


def _resolved_packages() -> tuple[str, ...]:
    packages = {
        f"{_normalize_package_name(dist.metadata['Name'])}=={dist.version}"
        for dist in distributions()
        if dist.metadata["Name"]
    }
    return tuple(sorted(packages))


def _normalize_package_name(name: str) -> str:
    return name.strip().lower().replace("_", "-").replace(".", "-")


def _package_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for dist in distributions():
        name = dist.metadata["Name"]
        if name:
            versions[_normalize_package_name(name)] = dist.version
    return versions


def _script_lock_sha256() -> str | None:
    if not SCRIPT_LOCK_PATH.is_file():
        return None
    return hashlib.sha256(SCRIPT_LOCK_PATH.read_bytes()).hexdigest()


def _git(*args: str) -> str | None:
    try:
        completed = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=True,
            cwd=Path(__file__).resolve().parent,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return completed.stdout.strip()


def _training_code_git_sha() -> str | None:
    injected = os.environ.get(TRAINING_CODE_GIT_SHA_ENV)
    if injected:
        return injected.strip().lower()
    head = _git("rev-parse", "HEAD")
    return head.lower() if head else None


def _training_code_git_status() -> str:
    porcelain = _git("status", "--porcelain")
    if porcelain is None:
        return "unknown"
    return "clean" if porcelain == "" else "dirty"


def _blas_description() -> str:
    try:
        import numpy as np

        blas = np.show_config(mode="dicts")["Build Dependencies"]["blas"]
        return f"{blas.get('name', 'unknown')} {blas.get('version', 'unknown')}"
    except Exception:  # noqa: BLE001 - BLAS 메타데이터 부재는 계약 위반이 아니다
        return "unknown"


def probe_runtime_context() -> RuntimeContext:
    return RuntimeContext(
        uv_version=_uv_version(),
        python_version=platform.python_version(),
        python_implementation=platform.python_implementation(),
        package_versions=_package_versions(),
        thread_env={name: os.environ.get(name, "") for name in REQUIRED_THREAD_ENV},
        script_lock_sha256=_script_lock_sha256(),
        training_code_git_sha=_training_code_git_sha(),
    )


def enforce_runtime_contract() -> RuntimeManifest:
    """계약 위반이 하나라도 있으면 학습 전에 RuntimeContractError를 던진다."""
    context = probe_runtime_context()
    violations = check_runtime_contract(context)
    if violations:
        raise RuntimeContractError("\n".join(f"- {violation}" for violation in violations))

    assert context.uv_version is not None
    assert context.script_lock_sha256 is not None
    assert context.training_code_git_sha is not None

    return RuntimeManifest(
        uv_version=context.uv_version,
        python_version=context.python_version,
        python_implementation=context.python_implementation,
        os=platform.system(),
        arch=platform.machine(),
        blas=_blas_description(),
        thread_env=dict(sorted(context.thread_env.items())),
        resolved_packages=_resolved_packages(),
        script_lock_sha256=context.script_lock_sha256,
        training_code_git_sha=context.training_code_git_sha,
        training_code_git_status=_training_code_git_status(),
    )
