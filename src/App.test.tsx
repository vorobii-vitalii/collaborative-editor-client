import React from "react";
import { render, screen } from "@testing-library/react";
import EditApp from "./EditApp";

test("renders learn react link", () => {
  render(<EditApp />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
