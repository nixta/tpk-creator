#TPK Size Estimator

Visit at [http://nixta.github.io/tpk-creator](http://nixta.github.io/tpk-creator).

Select zoom levels, and set the maps extent to see tile counts. If the count is less than 100,000 (the ArcGIS Online TPK generation limit), you can click `Estimate Size` to request the size of the TPK.

If you zoom out too far, the tile count could exceed the actual number - the app uses the Map's extent, not the tile layer's max extent, and extrapolates where the former is greater than the latter.