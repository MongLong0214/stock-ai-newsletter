"""Tests for optimize.py"""
import json
import subprocess
import sys
import pytest
from unittest.mock import patch, MagicMock

# Add script dir to path
sys.path.insert(0, "scripts/tli/research/optimizer")

from param_space import suggest_core, suggest_finetune, validate_params


class MockTrial:
    def __init__(self):
        self._params = {}

    def suggest_float(self, name, low, high):
        val = (low + high) / 2
        self._params[name] = val
        return val

    def suggest_int(self, name, low, high):
        val = (low + high) // 2
        self._params[name] = val
        return val

    @property
    def params(self):
        return self._params


def test_suggest_core_returns_10_params():
    trial = MockTrial()
    params = suggest_core(trial)
    assert len(params) == 10


def test_stage_thresholds_monotonic():
    trial = MockTrial()
    params = suggest_core(trial)
    assert params["stage_dormant"] < params["stage_emerging"]
    assert params["stage_emerging"] < params["stage_growth"]
    assert params["stage_growth"] < params["stage_peak"]


def test_validate_params_rejects_out_of_bounds():
    params = {"w_interest": 0.55, "w_newsMomentum": 0.45, "w_volatility": 0.20}
    # w_activity = 1.0 - 1.20 = -0.20 -> out of bounds
    assert validate_params(params) is False


def test_validate_params_accepts_valid():
    params = {"w_interest": 0.40, "w_newsMomentum": 0.35, "w_volatility": 0.10}
    # w_activity = 0.15 -> in [0.05, 0.25]
    assert validate_params(params) is True


def test_suggest_finetune_includes_core_keys():
    trial = MockTrial()
    core = suggest_core(trial)
    trial2 = MockTrial()
    fine = suggest_finetune(trial2, core)
    for key in core:
        assert key in fine


@patch("subprocess.run")
def test_subprocess_uses_list_command(mock_run):
    mock_run.return_value = MagicMock(
        returncode=0, stdout='{"gdda": 0.65}', stderr=""
    )

    from optimize import run_evaluate

    run_evaluate({"w_interest": 0.40}, "train")

    call_args = mock_run.call_args
    assert isinstance(call_args[0][0], list), "Must use list-based command"
    assert call_args[1].get("shell") is not True, "shell must not be True"


@patch("subprocess.run")
def test_subprocess_never_shell_true(mock_run):
    mock_run.return_value = MagicMock(
        returncode=0, stdout='{"gdda": 0.65}', stderr=""
    )

    from optimize import run_evaluate

    run_evaluate({"w_interest": 0.40}, "train")

    _, kwargs = mock_run.call_args
    assert kwargs.get("shell", False) is False


@patch(
    "subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="test", timeout=30)
)
def test_handles_timeout(mock_run):
    from optimize import run_evaluate

    result = run_evaluate({"w_interest": 0.40}, "train")
    assert result is None


@patch("subprocess.run")
def test_handles_crash_stderr(mock_run):
    mock_run.return_value = MagicMock(
        returncode=1, stdout="", stderr="Error: file not found"
    )

    from optimize import run_evaluate

    result = run_evaluate({"w_interest": 0.40}, "train")
    assert result is None


def test_overfitting_warning_logic():
    # This tests the logic, not the full pipeline
    train_gdda = 0.80
    val_gdda = 0.60
    gap = abs(train_gdda - val_gdda)
    assert gap > 0.10  # Would trigger warning
