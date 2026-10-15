import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { fetchBranding, fetchFeatures, fetchContent, type BrandingConfig, type FeaturesConfig, type ContentConfig } from "../../services/config.service";

interface ConfigState {
  branding: BrandingConfig | null;
  features: FeaturesConfig | null;
  content: ContentConfig | null;
  loading: boolean;
  error: string | null;
}

const initialState: ConfigState = {
  branding: null,
  features: null,
  content: null,
  loading: false,
  error: null,
};

// Async thunk to load all config
export const loadConfig = createAsyncThunk(
  "config/load",
  async () => {
    const [branding, features, content] = await Promise.all([
      fetchBranding(),
      fetchFeatures(),
      fetchContent(),
    ]);
    return { branding, features, content };
  }
);

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setBranding(state, action: PayloadAction<BrandingConfig>) {
      state.branding = action.payload;
    },
    setFeatures(state, action: PayloadAction<FeaturesConfig>) {
      state.features = action.payload;
    },
    setContent(state, action: PayloadAction<ContentConfig>) {
      state.content = action.payload;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadConfig.fulfilled, (state, action) => {
        state.branding = action.payload.branding;
        state.features = action.payload.features;
        state.content = action.payload.content;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load config";
      });
  },
});

export const { setBranding, setFeatures, setContent, setError } = configSlice.actions;
export default configSlice.reducer;
