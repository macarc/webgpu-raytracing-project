# Audio Ray-Tracing in the Browser with WebGPU
*Acoustics and Music Technology final year project.*

## Milestones
### 1. Ray intersection algorithm using WebGPU (1-2 weeks)
Room geometry data must be loaded into GPU memory, from which ray
intersection tests can be run.

### 2. Specular ray-tracing on GPU (2-4 weeks)
Specular ray-tracing involves tracing the path of an ideal ray through
space, and recording each reflection location.

### 3. Audio output from ray-tracing (4-8 weeks)
From each reflection location (a.k.a. late secondary source), rays are
traced directly to the receiver – with attenuation based on distance, dir-
ection and surface material – and combined.

### 4. Diffuse (scattered) ray-tracing, with audio output (4-8 weeks)
Diffuse ray-tracing adds a scattering coefficient to ray reflections, intro-
ducing randomness, which more accurately models certain materials and
helps to avoid geometric artefacts.

### 5. User interface for loading models/applying materials (4-8 weeks)
The user must be able to load the room model into the application, and
specify parameters such as materials and source/receiver position. My
implentation may be based off the CRAM open-source code. The
supported import formats will likely rely on 3rd-party libraries.

### 6. Bounding Volume Hierarchy (BVH) implementation (2-4 weeks)
BVH is a fundamental optimisation of ray-tracing methods, which divides
up triangles into a hierarchical set of boxes. The ray-tracing algorithm
can skip a large number of intersection tests by ignoring triangles in boxes
that are not intersected by the ray.

### 7. Comparative implementation in JavaScript or WebAssembly (2-4 weeks)
Having another implementation (with an identical algorithm) will allow
performance comparison. This will be in either JavaScript, or Rust/C/C++
compiled to WebAssembly, both of which are capable of running in the
browser.
