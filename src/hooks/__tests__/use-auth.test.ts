import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

const ANON_WORK = {
  messages: [{ role: "user", content: "build me a button" }],
  fileSystemData: { "/": { type: "directory" } },
};

const EXISTING_PROJECTS = [
  { id: "proj-1", name: "My Design", createdAt: new Date(), updatedAt: new Date() },
  { id: "proj-2", name: "Old Design", createdAt: new Date(), updatedAt: new Date() },
];

const NEW_PROJECT = {
  id: "proj-new",
  name: "New Design",
  userId: "user-1",
  messages: "[]",
  data: "{}",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth — initial state", () => {
  it("starts with isLoading false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });
});

describe("signIn — happy paths", () => {
  it("routes to anon project when sign-in succeeds and anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(ANON_WORK);
    mockCreateProject.mockResolvedValue({ ...NEW_PROJECT, id: "proj-anon" });

    const { result } = renderHook(() => useAuth());
    let returnedResult: unknown;
    await act(async () => {
      returnedResult = await result.current.signIn("user@test.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringContaining("Design from"),
      messages: ANON_WORK.messages,
      data: ANON_WORK.fileSystemData,
    });
    expect(mockClearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/proj-anon");
    expect(returnedResult).toEqual({ success: true });
  });

  it("routes to most recent project when no anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1");
    });

    expect(mockGetProjects).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/proj-1");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it("creates and routes to new project when user has no projects and no anon work", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue(NEW_PROJECT);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^New Design #\d+$/),
      messages: [],
      data: {},
    });
    expect(mockPush).toHaveBeenCalledWith("/proj-new");
  });

  it("returns the action result", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    let returnedResult: unknown;
    await act(async () => {
      returnedResult = await result.current.signIn("user@test.com", "password1");
    });

    expect(returnedResult).toEqual({ success: true });
  });
});

describe("signIn — error states", () => {
  it("does not route when sign-in fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    let returnedResult: unknown;
    await act(async () => {
      returnedResult = await result.current.signIn("user@test.com", "wrongpass");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(returnedResult).toEqual({ success: false, error: "Invalid credentials" });
  });

  it("resets isLoading after a failed sign-in", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "wrongpass");
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading even when signInAction throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("signIn — isLoading state", () => {
  it("sets isLoading to true while the action is in-flight", async () => {
    let resolveSignIn!: (v: { success: boolean }) => void;
    mockSignIn.mockReturnValue(new Promise((r) => (resolveSignIn = r)));
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signIn("user@test.com", "password1");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: true });
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("signUp — happy paths", () => {
  it("routes to anon project when sign-up succeeds and anon work exists", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(ANON_WORK);
    mockCreateProject.mockResolvedValue({ ...NEW_PROJECT, id: "proj-anon" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringContaining("Design from"),
      messages: ANON_WORK.messages,
      data: ANON_WORK.fileSystemData,
    });
    expect(mockClearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/proj-anon");
  });

  it("routes to most recent project when no anon work exists", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "password1");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  it("creates and routes to new project when user has no projects and no anon work", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue(NEW_PROJECT);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^New Design #\d+$/),
      messages: [],
      data: {},
    });
    expect(mockPush).toHaveBeenCalledWith("/proj-new");
  });

  it("returns the action result", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    let returnedResult: unknown;
    await act(async () => {
      returnedResult = await result.current.signUp("new@test.com", "password1");
    });

    expect(returnedResult).toEqual({ success: true });
  });
});

describe("signUp — error states", () => {
  it("does not route when sign-up fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    let returnedResult: unknown;
    await act(async () => {
      returnedResult = await result.current.signUp("existing@test.com", "password1");
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(returnedResult).toEqual({ success: false, error: "Email already registered" });
  });

  it("resets isLoading after a failed sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("existing@test.com", "password1");
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("resets isLoading even when signUpAction throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "password1").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("signUp — isLoading state", () => {
  it("sets isLoading to true while the action is in-flight", async () => {
    let resolveSignUp!: (v: { success: boolean }) => void;
    mockSignUp.mockReturnValue(new Promise((r) => (resolveSignUp = r)));
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signUp("new@test.com", "password1");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: true });
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("handlePostSignIn — anon work edge cases", () => {
  it("skips anon project creation when anon work has zero messages", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1");
    });

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  it("does not call clearAnonWork when no anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
  });

  it("passes anon messages and fileSystemData to createProject", async () => {
    const customAnon = {
      messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }],
      fileSystemData: { "/": { type: "directory" }, "/App.tsx": { content: "export default () => <div/>" } },
    };
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(customAnon);
    mockCreateProject.mockResolvedValue(NEW_PROJECT);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@test.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: customAnon.messages,
        data: customAnon.fileSystemData,
      })
    );
  });
});
