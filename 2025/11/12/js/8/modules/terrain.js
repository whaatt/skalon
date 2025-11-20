/** @typedef {import("./typings.js").SunMode} SunMode */
/** @typedef {import("./manager.js").TerrainManager} TerrainManager */

import { SUN_AZIMUTH_DEFAULT, SUN_ELEVATION_DEFAULT } from "./constants.js";
import { TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from "./shaders.js";

/**
 * Class for rendering DEM (Digital Elevation Model) terrain data with
 * hillshade. Use `TerrainManager` directly to get the current DEM data.
 */
export class TerrainCanvas {
  /**
   * @param {number} width
   * @param {number} height
   * @param {TerrainManager} terrainManager
   */
  constructor(width, height, terrainManager) {
    try {
      this.width = width;
      this.height = height;
      this.terrainManager = terrainManager;
      this.canvas = this.createCanvas(width, height);

      // Used for coloring.
      this.minZ = 0;
      this.maxZ = 0;

      // Set before first render (can be updated).
      this.referenceMinZ = null;
      this.referenceMaxZ = null;

      // Dynamic sun position (can be updated).
      this.sunAzimuth = SUN_AZIMUTH_DEFAULT;
      this.sunElevation = SUN_ELEVATION_DEFAULT;

      // Pixel art settings.
      this.pixelArtScale = 1; // Sample DEM every `N` pixels.
      this.colorQuantization = 256; // Number of color levels per channel.

      // Quality mode (not used; serves as a hard-coded multiplier for
      // `pixelArtScale` but is currently set to 1).
      this.qualityMode = "high";

      /** @type {SunMode} */
      this.mode = 0;

      // WebGL context and resources.
      this.gl = null;
      this.program = null;
      this.demTexture = null;

      this.initializeWebGL();
      console.log("TerrainCanvas: Initialized successfully");
    } catch (error) {
      console.error("TerrainCanvas: Error during initialization:", error);
      throw error;
    }
  }

  /**
   * Creates a DEM canvas.
   *
   * @param {number} width
   * @param {number} height
   * @returns {HTMLCanvasElement}
   * @private
   */
  createCanvas(width, height) {
    // Create 2D canvas for MapLibre to reference.
    const demCanvas = document.createElement("canvas");
    demCanvas.width = width;
    demCanvas.height = height;
    return demCanvas;
  }

  /**
   * Initializes WebGL context and shaders.
   *
   * @private
   */
  initializeWebGL() {
    try {
      const gl = this.canvas.getContext("webgl", {
        preserveDrawingBuffer: true,
        antialias: false,
        depth: false,
        stencil: false,
      });
      this.gl = gl;
      if (!gl) {
        throw new Error("WebGL not supported");
      }

      // Create shader program.
      this.program = this.createShaderProgram();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Creates and compiles a shader.
   *
   * @param {number} type - `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`
   * @param {string} source - Shader source code
   * @returns {WebGLShader}
   * @private
   */
  createShader(type, source) {
    const gl = this.gl;
    if (!gl) {
      throw new Error("WebGL context not initialized");
    }

    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("Failed to create shader");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error: ${error}`);
    }
    return shader;
  }

  /**
   * Creates the shader program for terrain rendering.
   *
   * @returns {WebGLProgram}
   * @private
   */
  createShaderProgram() {
    const gl = this.gl;
    if (!gl) {
      throw new Error("WebGL context not initialized");
    }

    const vertexShader = this.createShader(
      gl.VERTEX_SHADER,
      TERRAIN_VERTEX_SHADER
    );
    const fragmentShader = this.createShader(
      gl.FRAGMENT_SHADER,
      TERRAIN_FRAGMENT_SHADER
    );

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking error: ${error}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
  }

  /**
   * Colors and shades the canvas with DEM data.
   */
  render() {
    const dem = this.terrainManager.getCurrentDem();
    if (!dem) {
      throw new Error("DEM data not available from TerrainManager");
    }

    const noDataValue = this.terrainManager.noDataValue;
    const pixelSize = this.terrainManager.pixelSize;
    try {
      const gl = this.gl;
      if (!gl || !this.program) {
        throw new Error("WebGL context or program not initialized");
      }

      // Calculate DEM minimum and maximum for elevation encoding purposes.
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < dem.length; i++) {
        const z = dem[i];
        if (z !== noDataValue && isFinite(z)) {
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }
      // Fallback if no valid data found.
      if (!isFinite(minZ) || !isFinite(maxZ) || minZ === maxZ) {
        minZ = 0;
        maxZ = 100;
      }
      this.minZ = minZ;
      this.maxZ = maxZ;

      // If we don't have a reference minimum and maximum, set them to zero and
      // the DEM maximum (these are used for the maximum colorable range).
      if (this.referenceMinZ === null || this.referenceMaxZ === null) {
        this.referenceMinZ = 0;
        this.referenceMaxZ = maxZ;
      }

      // Pack DEM into texture and shade the terrain fragment.
      this.updateTexture(dem, this.width, this.height, minZ, maxZ, noDataValue);
      this.shade(minZ, maxZ, noDataValue, pixelSize);

      // Check for WebGL errors.
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        /** @type {{ [key: number]: string }} */
        const errorNames = {
          [gl.NO_ERROR]: "NO_ERROR",
          [gl.INVALID_ENUM]: "INVALID_ENUM",
          [gl.INVALID_VALUE]: "INVALID_VALUE",
          [gl.INVALID_OPERATION]: "INVALID_OPERATION",
          [gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
          [gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
        };
        console.error(
          `TerrainCanvas: WebGL error after draw: ${
            errorNames[error] || String(error)
          }`
        );
      }
    } catch (error) {
      console.error("TerrainCanvas: Error during rendering:", error);
      throw error;
    }
  }

  /**
   * Updates the DEM texture from `Float32Array` data by packing elevation
   * values into RGBA channels.
   *
   * @param {Float32Array} dem - DEM data
   * @param {number} width - DEM width
   * @param {number} height - DEM height
   * @param {number} minZ - Minimum elevation
   * @param {number} maxZ - Maximum elevation
   * @param {number} noDataValue - No-data value
   * @private
   */
  updateTexture(dem, width, height, minZ, maxZ, noDataValue) {
    const gl = this.gl;
    if (!gl) {
      throw new Error("WebGL context not initialized");
    }

    // Store normalized 0–1 elevation across `RGBA` channels with 16-bit
    // precision.
    // - R = High byte (0–255)
    // - G = Low byte (0–255)
    // - B = Unused
    // - A = Flag (255 = valid data; 0 = no data)
    const textureData = new Uint8Array(width * height * 4);

    const range = maxZ - minZ;
    for (let i = 0; i < dem.length; i++) {
      const textureIdx = i * 4;
      const value = dem[i];

      if (value === noDataValue || !isFinite(value)) {
        // Case: No data at DEM index.
        textureData[textureIdx] = 0;
        textureData[textureIdx + 1] = 0;
        textureData[textureIdx + 2] = 0;
        textureData[textureIdx + 3] = 0;
      } else {
        // Case: Valid data at DEM index.
        // Normalize elevation to [0, 1] range using the DEM range.
        // We will unpack this in the shader using `u_minZ` and `u_maxZ`.
        const normalized = range > 0 ? (value - minZ) / range : 0;
        // Split elevation into two bytes for 16-bit precision.
        const scaled = Math.max(
          0,
          Math.min(65535, Math.round(normalized * 65535))
        );
        const highByte = Math.floor(scaled / 256);
        const lowByte = scaled % 256;

        // Pack bytes into texture data.
        textureData[textureIdx] = highByte;
        textureData[textureIdx + 1] = lowByte;
        textureData[textureIdx + 2] = 0;
        textureData[textureIdx + 3] = 255;
      }
    }

    if (!this.demTexture) {
      this.demTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.demTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      textureData
    );

    // Set texture coordinates to clamp rather than wrap.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Use nearest value filtering for minification and magnification (no
    // interpolation between texels).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /**
   * Shades the terrain using WebGL.
   *
   * @param {number} minZ - Minimum elevation value
   * @param {number} maxZ - Maximum elevation value
   * @param {number} noDataValue - No-data value
   * @param {number} pixelSize - Pixel size
   * @private
   */
  shade(minZ, maxZ, noDataValue, pixelSize) {
    const gl = this.gl;
    if (!gl || !this.program || !this.demTexture) {
      return;
    }

    // Unused optimization for lower-quality rendering (by changing the sampling
    // scale for converting fragment pixels to texture coordinates).
    const scale =
      this.qualityMode === "low"
        ? this.pixelArtScale // Add a multiplier for lower quality rendering.
        : this.pixelArtScale;

    // Set up viewport and clear canvas.
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = this.program;
    gl.useProgram(program);

    // Create full-screen quad vertices (consisting of two triangles around the
    // center of the screen).
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Set up position attribute pointing to vertex coordinates.
    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms.
    gl.uniform2f(
      gl.getUniformLocation(program, "u_resolution"),
      this.width,
      this.height
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_minZ"), minZ);
    gl.uniform1f(gl.getUniformLocation(program, "u_maxZ"), maxZ);
    const colorMinZ = this.referenceMinZ !== null ? this.referenceMinZ : 0;
    const colorMaxZ = this.referenceMaxZ !== null ? this.referenceMaxZ : maxZ;
    gl.uniform1f(gl.getUniformLocation(program, "u_colorMinZ"), colorMinZ);
    gl.uniform1f(gl.getUniformLocation(program, "u_colorMaxZ"), colorMaxZ);
    gl.uniform1f(
      gl.getUniformLocation(program, "u_sunAzimuth"),
      this.sunAzimuth
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_sunElevation"),
      this.sunElevation
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_noDataValue"), noDataValue);
    gl.uniform1f(gl.getUniformLocation(program, "u_pixelSize"), pixelSize);
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), scale);
    gl.uniform1f(
      gl.getUniformLocation(program, "u_colorQuantization"),
      this.colorQuantization
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_mode"), this.mode);

    // Bind DEM texture to a uniform.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.demTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_dem"), 0);

    // Shade the full-screen quad.
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Clean up vertex buffer.
    gl.deleteBuffer(positionBuffer);
  }

  /**
   * Sets the reference elevation values for consistent elevation coloring (this
   * defines the maximum colorable range).
   *
   * @param {number} _minZ - Minimum elevation value (ignored; always set to 0)
   * @param {number} maxZ - Maximum elevation value
   */
  setReferenceMinMax(_minZ, maxZ) {
    this.referenceMinZ = 0;
    this.referenceMaxZ = maxZ;
  }

  /**
   * Updates the sun position for hillshade calculation.
   *
   * @param {number} azimuth - Sun azimuth in degrees (0-360; clockwise from North)
   * @param {number} elevation - Sun elevation in degrees (0-90; above horizon)
   */
  setSunPosition(azimuth, elevation) {
    this.sunAzimuth = azimuth;
    this.sunElevation = elevation;
  }

  /**
   * Sets the quality mode for rendering.
   *
   * @param {'high' | 'low'} mode
   */
  setQualityMode(mode) {
    this.qualityMode = mode;
  }

  /**
   * Sets the sun mode for hillshade calculation.
   *
   * @param {SunMode} mode
   */
  setSunMode(mode) {
    this.mode = mode;
  }
}
