import type { AppRouterClient } from "@medihub/api";

/** 患者档案相关的数据类型，全部从 oRPC 客户端推导，接口变化时无需手改。 */
type PatientClient = AppRouterClient["patients"];

type AdmissionClient = AppRouterClient["admissions"];

type AssetClient = AppRouterClient["assets"];

type ProcedureOutput<TProcedure> = TProcedure extends (
  ...args: never[]
) => Promise<infer TOutput>
  ? TOutput
  : never;

export type PatientList = ProcedureOutput<PatientClient["list"]>;

export type PatientListItem = PatientList["items"][number];

export type PatientDetail = ProcedureOutput<PatientClient["get"]>;

export type PatientRecord = PatientDetail["patient"];

export type AdmissionSummary = PatientDetail["admissions"][number];

export type AdmissionDetailResult = ProcedureOutput<AdmissionClient["get"]>;

export type AdmissionRecord = AdmissionDetailResult["admission"];

export type AssetList = ProcedureOutput<AssetClient["list"]>;

export type PatientAsset = AssetList["items"][number];

export type PatientGender = PatientRecord["gender"];

export type PatientStatus = PatientRecord["status"];

export type AdmissionKind = AdmissionRecord["kind"];

export type AssetKind = PatientAsset["kind"];

export type ClinicalStage = NonNullable<PatientAsset["stage"]>;
