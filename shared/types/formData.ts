export interface FormData {
  target: string;
  scope: string;
  description: string;
  template?: string;
  username?: string;
  password?: string;
}

export interface AuthData {
  username: string;
  password: string;
}

export interface WorkflowRequest extends FormData {
  auth?: AuthData;
} 