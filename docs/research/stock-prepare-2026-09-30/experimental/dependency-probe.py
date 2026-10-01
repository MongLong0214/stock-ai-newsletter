# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
import json
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
import lightgbm
from lightgbm import LGBMRanker
print(json.dumps({'numpy':np.__version__,'sklearn':sklearn.__version__,'lightgbm':lightgbm.__version__,'imports':['HistGradientBoostingRegressor','IsotonicRegression','LGBMRanker']},sort_keys=True),flush=True)
