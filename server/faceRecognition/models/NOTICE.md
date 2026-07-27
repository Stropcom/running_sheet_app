# Model provenance

Both models are redistributed here under their original MIT licenses. No
runtime network fetch is required — they are loaded from disk.

## retinaface_mnet25.onnx

RetinaFace face detector (MobileNet-0.25 backbone), 5-point landmarks.
Source: `retinaface` npm package v0.0.6 (`mnet.25_v2.onnx`) by Shirasawa,
https://github.com/ShirasawaSama/retinaface-js — MIT License.

## mobileface.json / mobileface.bin

MobileFace face embedding model (ArcFace-family, 256-d output),
TensorFlow.js graph model format. Source: `@vladmandic/human-models` npm
package (`mobileface.json`/`.bin`), converted by vladmandic,
https://github.com/vladmandic/human — MIT License. Takes raw 0-255 input,
no normalization (see embed.ts for the empirical verification that led to
this choice over the sibling `mobilefacenet` model, which was discarded).
