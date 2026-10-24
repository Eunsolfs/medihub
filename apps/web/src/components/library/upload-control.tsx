import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import {
  getSessionRole,
  isOrglessRole,
} from "#src/components/app-shell/roles.ts";
import type { LibrarySource } from "#src/components/library/library-source.ts";
import { UploadButton } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";

interface LibraryUploadProps {
  /** 资料库目录分类下的当前文件夹 */
  collectionId?: string;
  onUploaded: () => void;
  source: LibrarySource;
}

const noopUpload = () => {
  // 分类不支持直接上传时，按钮保持禁用
};

/**
 * 上传目标跟随来源：患者记录要先选患者，会议资料要先选会议；
 * 资料库目录沿用当前文件夹；教学附件只能到对应文章里上传。
 */
export const LibraryUpload = ({
  collectionId,
  onUploaded,
  source,
}: LibraryUploadProps) => {
  const { session: routeSession } = useRouteContext({ from: "__root__" });
  // 没有归属科室的账号后端一律拒绝上传，患者下拉也会 403，所以不发起任何请求。
  const orgless = isOrglessRole(getSessionRole(routeSession));
  const [patientId, setPatientId] = useState("");
  const [sessionId, setSessionId] = useState("");

  const patientsQuery = useQuery({
    ...api.patients.options.queryOptions(),
    enabled: !orgless && source === "patients",
  });

  const sessionsQuery = useQuery({
    ...api.learning.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: !orgless && source === "sessions",
  });

  if (orgless) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled
          onClick={noopUpload}
          size="sm"
          title="当前账号没有归属科室，不能上传文件"
          variant="outline"
        >
          <UploadIcon />
          上传
        </Button>
        <span className="text-muted-foreground text-xs">
          没有归属科室，暂不能上传
        </span>
      </div>
    );
  }

  if (source === "collections") {
    return (
      <UploadButton
        onUploaded={onUploaded}
        size="sm"
        target={collectionId ? { collectionId } : {}}
      />
    );
  }

  if (source === "patients") {
    const patients = patientsQuery.data ?? [];

    return (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Select
          items={patients.map((patient) => ({
            label: patient.name,
            value: patient.id,
          }))}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setPatientId(value);
            }
          }}
          value={patientId}
        >
          <SelectTrigger
            aria-label="上传到哪位患者"
            className="min-w-0 flex-1 sm:w-40"
            size="sm"
          >
            <SelectValue placeholder="选择患者后上传" />
          </SelectTrigger>
          <SelectContent>
            {patients.map((patient) => (
              <SelectItem key={patient.id} value={patient.id}>
                {patient.name}
                {patient.medicalRecordNo
                  ? `（${patient.medicalRecordNo}）`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UploadButton
          disabled={!patientId}
          onUploaded={onUploaded}
          size="sm"
          target={patientId ? { patientId } : {}}
        />
      </div>
    );
  }

  if (source === "sessions") {
    const sessions = sessionsQuery.data?.items ?? [];

    return (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Select
          items={sessions.map((session) => ({
            label: session.title,
            value: session.id,
          }))}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setSessionId(value);
            }
          }}
          value={sessionId}
        >
          <SelectTrigger
            aria-label="上传到哪场会议"
            className="min-w-0 flex-1 sm:w-40"
            size="sm"
          >
            <SelectValue placeholder="选择会议后上传" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UploadButton
          disabled={!sessionId}
          onUploaded={onUploaded}
          size="sm"
          target={sessionId ? { sessionId } : {}}
        />
      </div>
    );
  }

  if (source === "posts") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled
          onClick={noopUpload}
          size="sm"
          title="请到对应文章里上传附件"
          variant="outline"
        >
          <UploadIcon />
          上传
        </Button>
        <span className="text-muted-foreground text-xs">
          请到对应文章里上传
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled
        onClick={noopUpload}
        size="sm"
        title="先切换到具体分类再上传"
        variant="outline"
      >
        <UploadIcon />
        上传
      </Button>
      <span className="text-muted-foreground text-xs">
        先切换到具体分类再上传
      </span>
    </div>
  );
};
