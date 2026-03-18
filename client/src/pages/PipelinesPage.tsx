import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { pipelinesApi } from "../api/queries";
import type { RecentProjectPipelines, RecentPipeline } from "../api/types";
import { useNavigate, Link } from "react-router-dom";
import { Play, Loader2, CheckCircle, XCircle, History, Search } from "lucide-react";
import { useState } from "react";
import { ProviderBadge } from "../components/ui/provider-badge";

export function PipelinesPage() {
  const { projects } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: recentData } = useQuery({
    queryKey: ["recentPipelines"],
    queryFn: pipelinesApi.getRecent,
    refetchInterval: 5000,
  });

  if (!projects || projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center text-slate-500">
        <p className="text-xl">You do not have access to any projects.</p>
      </div>
    );
  }

  const lowerQuery = searchQuery.toLowerCase();
  const filteredProjects = projects?.map(project => {
    const isProjectMatch = project.name.toLowerCase().includes(lowerQuery) ||
                           (project.description && project.description.toLowerCase().includes(lowerQuery));

    if (isProjectMatch) return project;

    const matchingPipelines = project.pipelines.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.ref.toLowerCase().includes(lowerQuery)
    );

    return { ...project, pipelines: matchingPipelines };
  }).filter(project => project.pipelines.length > 0);

  return (
    <div className="space-y-8 pb-10">
      <div className="relative w-full max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <Input
          placeholder="Search projects, pipelines, or refs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 h-12 text-base shadow-sm border-[1.5px] rounded-lg bg-white dark:bg-slate-900"
        />
      </div>

      <div>
        <h2 className="text-3xl font-bold tracking-tight">Pipelines</h2>
        <p className="text-slate-500 mt-2">Trigger CI/CD pipelines across all your allowed projects.</p>
      </div>

      <div className="space-y-12">
        {filteredProjects?.length === 0 ? (
          <div className="text-center py-12 text-slate-500 italic border-[1.5px] border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            No projects or pipelines match your search for "{searchQuery}".
          </div>
        ) : (
          filteredProjects?.map((project) => (
            <section key={project.id} className="space-y-4">
              <div className="border-b-[1.5px] border-slate-200 dark:border-slate-700 pb-2 mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                {project.name}
                <ProviderBadge type={(project as any).providerType} />
              </h3>
              {project.description && <p className="text-slate-500 mt-1">{project.description}</p>}
            </div>

            {project.pipelines.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No pipelines allowed for this project.</p>
            ) : (
              <div className="rounded-md border-[1.5px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <Table>
                  <TableHeader className="">
                    <TableRow>
                      <TableHead className="w-[30%]">Pipeline Name</TableHead>
                      <TableHead className="w-[10%]">Ref</TableHead>
                      <TableHead className="w-[15%]">Last Pipeline</TableHead>
                      <TableHead className="w-[15%]">Currently Running</TableHead>
                      <TableHead className="text-right w-[20%]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.pipelines.map((pipeline) => {
                      const projectRecent = recentData?.find((r: RecentProjectPipelines) => r.projectId === project.id);
                      const projectPipelines: RecentPipeline[] = projectRecent?.pipelines || [];
                      const matchingPipelines = projectPipelines.filter((p: RecentPipeline) => p.ref === pipeline.ref);

                      const runningPipeline = matchingPipelines.find((p: RecentPipeline) => p.status === "running" || p.status === "pending" || p.status === "created");
                      const lastPipeline = matchingPipelines.find((p: RecentPipeline) => !["running", "pending", "created"].includes(p.status));

                      const getStatusIcon = (status: string) => {
                        if (status === "success") return <CheckCircle className="text-green-500 inline mr-1" size={14} />;
                        if (status === "failed") return <XCircle className="text-red-500 inline mr-1" size={14} />;
                        if (status === "running" || status === "pending") return <Loader2 className="text-blue-500 animate-spin inline mr-1" size={14} />;
                        return null;
                      };

                      return (
                      <TableRow key={pipeline.name}>
                        <TableCell className="font-semibold">{pipeline.name}</TableCell>
                        <TableCell>
                          <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-300">{pipeline.ref}</code>
                        </TableCell>
                        <TableCell>
                          {lastPipeline ? (
                            <div className="flex items-center">
                              {getStatusIcon(lastPipeline.status)}
                              <Link to={`/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/run/${lastPipeline.id}`} className="text-primary hover:underline font-medium text-xs flex items-center">
                                #{lastPipeline.id}
                              </Link>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {runningPipeline ? (
                            <div className="flex items-center">
                              <Loader2 className="text-blue-500 animate-spin inline mr-1" size={14} />
                              <Link to={`/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/run/${runningPipeline.id}`} className="text-primary hover:underline font-medium text-xs flex items-center">
                                #{runningPipeline.id}
                              </Link>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Not running</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              className="font-bold text-xs px-3 shadow-none border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                              size="sm"
                              onClick={() => navigate(`/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/history`)}
                            >
                              <History size={14} className="mr-1 inline-block" />
                              History
                            </Button>
                            <Button
                              className="font-bold text-xs px-3"
                              size="sm"
                              onClick={() => navigate(`/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}`)}
                            >
                              <Play size={14} className="mr-1 inline-block" />
                              Launch
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
