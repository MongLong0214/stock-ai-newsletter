import unittest
from utility_target import combine_heads


class CompositeTargetTest(unittest.TestCase):
    def test_likely_touch_cannot_overwhelm_likely_loss(self):
        self.assertGreater(combine_heads(.5, .8), combine_heads(.9, .3))

    def test_zero_touch_or_zero_non_loss_is_zero(self):
        self.assertEqual(combine_heads(0, 1), 0)
        self.assertEqual(combine_heads(1, 0), 0)

    def test_non_loss_uses_squared_penalty(self):
        self.assertAlmostEqual(combine_heads(.8, .5), .2)
        self.assertGreater(combine_heads(.8, .7), combine_heads(.8, .5))

    def test_clips_each_head_before_combining(self):
        self.assertEqual(combine_heads(2, 2), 1)
        self.assertEqual(combine_heads(2, -.5), 0)
        self.assertEqual(combine_heads(-.5, 2), 0)

    def test_rejects_unknown_predictions(self):
        for value in [None, True, '0.5', float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                combine_heads(value, .5)
            with self.assertRaises(ValueError):
                combine_heads(.5, value)


if __name__ == '__main__':
    unittest.main()
