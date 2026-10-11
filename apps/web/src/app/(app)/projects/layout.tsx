import { ProjectsShell } from "@/features/projects/projects-shell";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <ProjectsShell>{children}</ProjectsShell>;
}
