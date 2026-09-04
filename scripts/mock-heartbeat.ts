import { readMockState, sendMockState } from "./send-mock-state.js";

await sendMockState(readMockState());
