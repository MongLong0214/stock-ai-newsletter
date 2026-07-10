import { describe, expect, it } from 'vitest'

import { loadConfirmatoryFeatureBatch } from '../features/load-confirmatory-feature-inputs'
import { createConfirmatoryBatchFixture } from './load-confirmatory-feature-inputs.batch.fixture'

describe('loadConfirmatoryFeatureBatch O(1) assembly', () => {
  it.each([1, 193])(
    'uses exactly eight deterministic batch reads for %i frozen themes',
    async (themeCount) => {
      // Given
      const fixture = createConfirmatoryBatchFixture(themeCount)
      const dataSource = fixture.createDataSource(false)

      // When
      const batch = await loadConfirmatoryFeatureBatch(fixture.request, dataSource)

      // Then
      const batchMethods = [
        dataSource.loadStudyOriginBundle,
        dataSource.loadStudyThemeInputs,
        dataSource.loadForecastOriginManifest,
        dataSource.loadForecastThemeInputs,
        dataSource.loadCollectionRunsByIds,
        dataSource.loadInterestObservationsByRunIds,
        dataSource.loadNewsObservationsByIds,
        dataSource.loadBablObservationsByIds,
      ]
      for (const method of batchMethods) {
        expect(method).toHaveBeenCalledTimes(1)
      }
      expect(batchMethods.reduce(
        (total, method) => total + method.mock.calls.length,
        0,
      )).toBe(8)
      expect(batch.snapshots).toHaveLength(themeCount)
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.themeId))
        .toEqual(fixture.themeIds)
      expect(batch.snapshots.every((snapshot) => !snapshot.abstain)).toBe(true)
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.interestRunId))
        .toEqual(fixture.interestRunIds)
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.newsObservationIds))
        .toEqual(fixture.newsObservationIdsByTheme)
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.newsInputSha256))
        .toEqual(fixture.newsInputHashes)
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.newsRunIds))
        .toEqual(fixture.newsRunIds.map((runId) => [runId]))
      expect(batch.snapshots.map((snapshot) => snapshot.provenance.newsSourceAgeDays))
        .toEqual(Array.from({ length: themeCount }, () => 0))
      for (const [index, snapshot] of batch.snapshots.entries()) {
        expect(snapshot.provenance).toHaveProperty(
          'newsRunResponseSha256s',
          [fixture.newsRunResponseSha256s[index]],
        )
      }
      expect(dataSource.requestedIds.collectionRunIds)
        .toEqual([...fixture.interestRunIds, ...fixture.newsRunIds])
      expect(dataSource.requestedIds.interestObservationRunIds)
        .toEqual(fixture.interestRunIds)
      expect(dataSource.requestedIds.newsObservationIds)
        .toEqual(fixture.newsObservationIds)
      expect(dataSource.requestedIds.bablObservationIds).toEqual([])
      const selectorSentinels = [
        dataSource.loadLatestForecastOriginManifest,
        dataSource.loadStudyOriginBundleByTuple,
      ]
      const perThemeSentinels = [
        dataSource.loadInterestObservationsForTheme,
        dataSource.loadNewsObservationsForTheme,
        dataSource.loadBablObservationsForTheme,
      ]
      for (const sentinel of [...selectorSentinels, ...perThemeSentinels]) {
        expect(sentinel).toHaveBeenCalledTimes(0)
      }
    },
  )

  it('keeps frozen vectors immutable when broad pools contain post-manifest noise', async () => {
    // Given
    const fixture = createConfirmatoryBatchFixture(3)
    const baselineDataSource = fixture.createDataSource(false)
    const noisyDataSource = fixture.createDataSource(true)

    // When
    const baseline = await loadConfirmatoryFeatureBatch(
      fixture.request,
      baselineDataSource,
    )
    const noisy = await loadConfirmatoryFeatureBatch(fixture.request, noisyDataSource)

    // Then
    expect(noisy.snapshots.map((snapshot) => snapshot.values))
      .toEqual(baseline.snapshots.map((snapshot) => snapshot.values))
    expect(noisy.snapshots.map((snapshot) => snapshot.provenance))
      .toEqual(baseline.snapshots.map((snapshot) => snapshot.provenance))
    expect(noisy.snapshots.map((snapshot) => snapshot.featureSnapshotSha256))
      .toEqual(baseline.snapshots.map((snapshot) => snapshot.featureSnapshotSha256))
    const mixedScaleStitchedVectorCount = noisy.snapshots.filter(
      (snapshot, index) => snapshot.featureSnapshotSha256
        !== baseline.snapshots[index]?.featureSnapshotSha256,
    ).length
    expect(mixedScaleStitchedVectorCount).toBe(0)
    expect(noisyDataSource.requestedIds.collectionRunIds)
      .toEqual([...fixture.interestRunIds, ...fixture.newsRunIds])
    expect(noisyDataSource.requestedIds.interestObservationRunIds)
      .toEqual(fixture.interestRunIds)
    expect(noisyDataSource.requestedIds.collectionRunIds.filter(
      (runId) => fixture.alternateInterestRunIds.includes(runId),
    )).toEqual([])
    expect(noisyDataSource.requestedIds.collectionRunIds.filter(
      (runId) => fixture.futureNewsRunIds.includes(runId),
    )).toEqual([])
    expect(noisyDataSource.requestedIds.newsObservationIds)
      .toEqual(fixture.newsObservationIds)
    expect(noisyDataSource.requestedIds.newsObservationIds.filter(
      (observationId) => fixture.lateNewsObservationIds.includes(observationId),
    )).toEqual([])
    expect(noisyDataSource.loadLatestForecastOriginManifest).toHaveBeenCalledTimes(0)
    expect(noisyDataSource.loadStudyOriginBundleByTuple).toHaveBeenCalledTimes(0)
  })
})
