export default function(params) {
  return `
  #version 100
  precision highp float;
  
  // Deferred stuff ===========================================================
  uniform sampler2D u_gbuffers[${params.numGBuffers}];
  
  varying vec2 v_uv;
  // Deferred stuff END =======================================================

  // Clustered stuff ==========================================================
  uniform sampler2D u_lightbuffer;
  // u_dims: X and Y are screen dims (divide gl_FragCoord by this)
  //         Z is camera near plane
  //         W is camera far - near
  uniform vec4 u_dims;
  // number of slices in each dimension
  uniform vec3 u_sliceCount;

  uniform mat4 u_viewMatrix;
  // index 0: texture width
  // index 1: texture height
  uniform vec2 u_texDims;

  // TODO: Read this buffer to determine the lights influencing a cluster
  uniform sampler2D u_clusterbuffer;

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = v1.w;//ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }
  // Clustered stuff END ======================================================
  
  void main() {
    // TODO: extract data from g buffers and do lighting
    vec4 gb0 = texture2D(u_gbuffers[0], v_uv);
    vec4 gb1 = texture2D(u_gbuffers[1], v_uv);
    vec4 gb2 = texture2D(u_gbuffers[2], v_uv);
    // vec4 gb3 = texture2D(u_gbuffers[3], v_uv);

    vec3 albedo = vec3(gb0);
    vec3 normal = vec3(gb1);
    vec3 v_position = vec3(gb2);

    vec3 fragColor = vec3(0.0);

    // use v_pos to compute Z slice
    vec3 viewSpacePos = vec3(u_viewMatrix * vec4(v_position, 1.0));
    viewSpacePos.z *= -1.0;
    vec3 clusterCoords = vec3(floor(gl_FragCoord.x / u_dims.x * u_sliceCount.x), floor(gl_FragCoord.y / u_dims.y * u_sliceCount.y), floor((viewSpacePos.z - u_dims.z) / u_dims.w * u_sliceCount.z));
    int idx = int(clusterCoords.x + (clusterCoords.y * u_sliceCount.x) + (clusterCoords.z * u_sliceCount.x * u_sliceCount.y)); 
    int lightCount = int(ExtractFloat(u_clusterbuffer, int(u_texDims[0]), int(u_texDims[1]), idx, 0));
    //lightCount = 100;

    for (int i = 0; i < ${params.numLights}; ++i) {
      if (i == lightCount) {
        break;
      } 
      int lightIdx = int(ExtractFloat(u_clusterbuffer, int(u_texDims[0]), int(u_texDims[1]), idx, i + 1));
      Light light = UnpackLight(lightIdx);
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);

    //gl_FragColor = gb1;//vec4(v_uv, 0.0, 1.0);
  }
  `;
}