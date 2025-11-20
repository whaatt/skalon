/**
 * WebGL shader source code for terrain rendering.
 */

export const TERRAIN_VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = (a_position + 1.0) * 0.5;
    v_texCoord.y = 1.0 - v_texCoord.y;
  }
`;

export const TERRAIN_FRAGMENT_SHADER = `
  precision mediump float;

  uniform sampler2D u_dem;
  uniform vec2 u_resolution;
  uniform float u_minZ;
  uniform float u_maxZ;
  uniform float u_colorMinZ;
  uniform float u_colorMaxZ;
  uniform float u_sunAzimuth;
  uniform float u_sunElevation;
  uniform float u_noDataValue;
  uniform float u_pixelSize;
  uniform float u_scale;
  uniform float u_colorQuantization;
  uniform float u_mode;

  varying vec2 v_texCoord;

  float quantizeColor(float value, float levels) {
    float step = 255.0 / (levels - 1.0);
    return floor(value / step + 0.5) * step;
  }

  float getElevation(vec2 coord) {
    vec2 pixelCoord = coord * u_resolution;
    vec2 texelCoord = floor(pixelCoord / u_scale) * u_scale + u_scale * 0.5;
    texelCoord = texelCoord / u_resolution;
    vec4 sample = texture2D(u_dem, texelCoord);

    if (sample.a < 0.5) {
      return u_noDataValue;
    }

    float highByte = sample.r * 255.0;
    float lowByte = sample.g * 255.0;
    float normalized = (highByte * 256.0 + lowByte) / 65535.0;
    return u_minZ + normalized * (u_maxZ - u_minZ);
  }

  float getElevationAtCoord(vec2 texCoord) {
    vec4 sample = texture2D(u_dem, texCoord);

    if (sample.a < 0.5) {
      return u_noDataValue;
    }

    float highByte = sample.r * 255.0;
    float lowByte = sample.g * 255.0;
    float normalized = (highByte * 256.0 + lowByte) / 65535.0;
    return u_minZ + normalized * (u_maxZ - u_minZ);
  }

  float getNeighborElevation(vec2 texCoord, vec2 offset, float centerZ) {
    vec2 neighborCoord = texCoord + offset;

    if (neighborCoord.x < 0.0 || neighborCoord.x > 1.0 || neighborCoord.y < 0.0 ||
        neighborCoord.y > 1.0) {
      return centerZ;
    }

    float nz = getElevationAtCoord(neighborCoord);
    return abs(nz - u_noDataValue) < 0.001 ? centerZ : nz;
  }

  float calculateHillshade(vec2 coord) {
    vec2 pixelCoord = coord * u_resolution;
    vec2 texelCoord = floor(pixelCoord / u_scale) * u_scale + u_scale * 0.5;
    texelCoord = texelCoord / u_resolution;

    float z = getElevationAtCoord(texelCoord);
    if (abs(z - u_noDataValue) < 0.001) {
      return 1.0;
    }

    vec2 onePixel = vec2(1.0) / u_resolution;

    float top = getNeighborElevation(texelCoord, vec2(0.0, -onePixel.y), z);
    float left = getNeighborElevation(texelCoord, vec2(-onePixel.x, 0.0), z);
    float right = getNeighborElevation(texelCoord, vec2(onePixel.x, 0.0), z);
    float bottom = getNeighborElevation(texelCoord, vec2(0.0, onePixel.y), z);

    float dzdx = right - left;
    float dzdy = top - bottom;

    float zMultiplier = 0.2;
    float slope = atan(zMultiplier * length(vec2(dzdx, dzdy)));
    float aspect = atan(-dzdy, -dzdx);

    float sunAzimuthRad = u_sunAzimuth * 3.14159265359 / 180.0;
    float sunElevationRad = u_sunElevation * 3.14159265359 / 180.0;

    float L = cos(1.57079632679 - aspect - sunAzimuthRad) * sin(slope) *
                  sin(1.57079632679 - sunElevationRad) +
              cos(slope) * cos(1.57079632679 - sunElevationRad);

    float hillshade = max(0.0, L);
    hillshade = sqrt(hillshade * 0.8 + 0.2);
    return clamp(hillshade, 0.0, 1.0);
  }

  vec4 getColor(float elevation, float hillshade) {
    float range = u_colorMaxZ - u_colorMinZ;
    float t = 0.0;
    if (range > 0.0001) {
      t = (elevation - u_colorMinZ) / range;
      t = clamp(t, 0.0, 1.0);
    }
    t = pow(t, 0.3);

    vec3 color;
    if (u_mode < 1.5) {
      if (t < 0.2) {
        float k = t / 0.2;
        color = mix(vec3(50.0, 200.0, 220.0), vec3(60.0, 180.0, 140.0), k);
      } else if (t < 0.4) {
        float k = (t - 0.2) / 0.2;
        color = mix(vec3(60.0, 180.0, 140.0), vec3(100.0, 200.0, 120.0), k);
      } else if (t < 0.6) {
        float k = (t - 0.4) / 0.2;
        color = mix(vec3(100.0, 200.0, 120.0), vec3(240.0, 220.0, 80.0), k);
      } else if (t < 0.8) {
        float k = (t - 0.6) / 0.2;
        color = mix(vec3(240.0, 220.0, 80.0), vec3(255.0, 150.0, 180.0), k);
      } else {
        float k = (t - 0.8) / 0.2;
        color = mix(vec3(255.0, 150.0, 180.0), vec3(180.0, 120.0, 240.0), k);
      }

      color = color * (0.4 + 0.6 * hillshade);
      color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, 1.3);
      color = min(color * 1.3, vec3(255.0));
    } else {
      if (t < 0.2) {
        float k = t / 0.2;
        color = mix(vec3(8.0, 12.0, 25.0), vec3(20.0, 25.0, 45.0), k);
      } else if (t < 0.4) {
        float k = (t - 0.2) / 0.2;
        color = mix(vec3(20.0, 25.0, 45.0), vec3(35.0, 60.0, 85.0), k);
      } else if (t < 0.6) {
        float k = (t - 0.4) / 0.2;
        color = mix(vec3(35.0, 60.0, 85.0), vec3(55.0, 90.0, 120.0), k);
      } else if (t < 0.8) {
        float k = (t - 0.6) / 0.2;
        color = mix(vec3(55.0, 90.0, 120.0), vec3(90.0, 110.0, 150.0), k);
      } else {
        float k = (t - 0.8) / 0.2;
        color = mix(vec3(90.0, 110.0, 150.0), vec3(130.0, 150.0, 180.0), k);
      }

      color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, 1.3);
      color = min(color * 1.3, vec3(255.0));
    }

    color.r = quantizeColor(color.r, u_colorQuantization);
    color.g = quantizeColor(color.g, u_colorQuantization);
    color.b = quantizeColor(color.b, u_colorQuantization);
    return vec4(color, 255.0);
  }

  void main() {
    vec2 coord = v_texCoord;
    float elevation = getElevation(coord);

    if (abs(elevation - u_noDataValue) < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    float hillshade = u_mode < 0.5 ? calculateHillshade(coord) : 1.0;
    vec4 color = getColor(elevation, hillshade);
    gl_FragColor = color / 255.0;
  }
`;
