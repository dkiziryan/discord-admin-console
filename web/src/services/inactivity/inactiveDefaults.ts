import type { DefaultInactiveCategoriesResponse } from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchDefaultInactiveCategories = async (): Promise<string[]> => {
  const data = await apiJson<DefaultInactiveCategoriesResponse>(
    "/api/inactive-defaults",
    {
      errorMessage: "Failed to load default categories.",
    },
  );
  return data.categories;
};
