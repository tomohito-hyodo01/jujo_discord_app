"""
Google Drive アップロードサービス

大会申込Excelファイルを指定のGoogle Driveフォルダ構造にアップロード
"""
import os
import json
import base64
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError


class GoogleDriveService:
    """Google Drive アップロードサービス"""

    # Google Drive APIのスコープ
    SCOPES = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive'
    ]

    # ルートフォルダID（大会申込システム）
    ROOT_FOLDER_ID = "1FsagEXaCGH4Y7gqZQbOqX6Nhe5hPLw9B"

    # 区ID → 区名のマッピング
    WARD_NAMES = {
        17: "北区",
        18: "荒川区",
        23: "江戸川区",
    }

    def __init__(self):
        """初期化"""
        self.service = self._initialize_drive_service()

    def _initialize_drive_service(self):
        """
        Google Drive サービスを初期化

        Returns:
            Google Drive API service
        """
        # 環境変数からサービスアカウントJSONを取得
        encoded_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")

        if not encoded_json:
            raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set")

        # Base64デコード
        decoded_json = base64.b64decode(encoded_json).decode('utf-8')
        creds_dict = json.loads(decoded_json)

        # 認証情報を作成
        credentials = Credentials.from_service_account_info(
            creds_dict,
            scopes=self.SCOPES
        )

        # Drive APIサービスを構築
        service = build('drive', 'v3', credentials=credentials)

        return service

    def upload_tournament_files(
        self,
        ward_id: int,
        tournament_name: str,
        file_paths: Dict[str, str]
    ) -> Dict[str, str]:
        """
        大会申込Excelファイルをアップロード

        フォルダ構造:
        大会申込システム/
        └── 登録申請書・大会申込書/
            └── {ward_name}/
                └── {current_year}年/
                    └── {tournament_name}/
                        ├── 会員登録表.xlsx
                        └── 個人戦申込書.xlsx

        Args:
            ward_id: 区ID
            tournament_name: 大会名
            file_paths: ファイルパスの辞書
                {
                    "member_registration": "output/xxx_会員登録表.xlsx",
                    "individual_application": "output/xxx_個人戦申込書.xlsx"
                }

        Returns:
            アップロードされたファイルのURL辞書
            {
                "member_registration": "https://drive.google.com/file/d/xxx",
                "individual_application": "https://drive.google.com/file/d/yyy"
            }
        """
        # 区名を取得
        ward_name = self.WARD_NAMES.get(ward_id)
        if not ward_name:
            raise ValueError(f"Unsupported ward_id: {ward_id}")

        # 現在の年度
        current_year = datetime.now().year

        # フォルダパスを構築
        folder_path = [
            "登録申請書・大会申込書",
            ward_name,
            f"{current_year}年",
            tournament_name
        ]

        # フォルダを作成・取得
        target_folder_id = self._create_folder_path(
            self.ROOT_FOLDER_ID,
            folder_path
        )

        # ファイルをアップロード
        result = {}

        if "member_registration" in file_paths:
            file_id = self._upload_file(
                file_paths["member_registration"],
                "会員登録表.xlsx",
                target_folder_id
            )
            result["member_registration"] = self._get_file_url(file_id)

        if "individual_application" in file_paths:
            file_id = self._upload_file(
                file_paths["individual_application"],
                "個人戦申込書.xlsx",
                target_folder_id
            )
            result["individual_application"] = self._get_file_url(file_id)

        return result

    def _create_folder_path(
        self,
        parent_folder_id: str,
        folder_names: List[str]
    ) -> str:
        """
        フォルダパスを作成（存在しなければ新規作成）

        Args:
            parent_folder_id: 親フォルダID
            folder_names: フォルダ名のリスト（階層順）

        Returns:
            最終的なフォルダID
        """
        current_folder_id = parent_folder_id

        for folder_name in folder_names:
            # フォルダを探す
            folder_id = self._find_folder(folder_name, current_folder_id)

            if folder_id:
                # 既存フォルダを使用
                current_folder_id = folder_id
            else:
                # 新規フォルダを作成
                current_folder_id = self._create_folder(
                    folder_name,
                    current_folder_id
                )

        return current_folder_id

    def _find_folder(
        self,
        folder_name: str,
        parent_folder_id: str
    ) -> Optional[str]:
        """
        指定された親フォルダ内でフォルダを検索

        Args:
            folder_name: 検索するフォルダ名
            parent_folder_id: 親フォルダID

        Returns:
            フォルダID（見つからない場合はNone）
        """
        query = (
            f"name='{folder_name}' and "
            f"'{parent_folder_id}' in parents and "
            f"mimeType='application/vnd.google-apps.folder' and "
            f"trashed=false"
        )

        try:
            response = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name)'
            ).execute()

            files = response.get('files', [])

            if files:
                return files[0]['id']

            return None

        except HttpError as e:
            print(f"Error finding folder: {e}")
            return None

    def _create_folder(
        self,
        folder_name: str,
        parent_folder_id: str
    ) -> str:
        """
        フォルダを作成

        Args:
            folder_name: フォルダ名
            parent_folder_id: 親フォルダID

        Returns:
            作成されたフォルダID
        """
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_folder_id]
        }

        folder = self.service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()

        return folder['id']

    def _upload_file(
        self,
        file_path: str,
        file_name: str,
        folder_id: str
    ) -> str:
        """
        ファイルをアップロード

        Args:
            file_path: ローカルファイルパス
            file_name: Google Drive上でのファイル名
            folder_id: アップロード先フォルダID

        Returns:
            アップロードされたファイルID
        """
        file_metadata = {
            'name': file_name,
            'parents': [folder_id]
        }

        media = MediaFileUpload(
            file_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            resumable=False
        )

        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        # 共有設定（リンクを知っている人は閲覧可能）
        self._set_file_permission(file['id'])

        return file['id']

    def _set_file_permission(self, file_id: str):
        """
        ファイルに閲覧権限を設定（リンクを知っている人）

        Args:
            file_id: ファイルID
        """
        permission = {
            'type': 'anyone',
            'role': 'reader'
        }

        try:
            self.service.permissions().create(
                fileId=file_id,
                body=permission
            ).execute()
        except HttpError as e:
            print(f"Warning: Could not set file permission: {e}")

    def _get_file_url(self, file_id: str) -> str:
        """
        ファイルのダウンロードURLを取得

        Args:
            file_id: ファイルID

        Returns:
            ファイルURL
        """
        return f"https://drive.google.com/file/d/{file_id}/view"

    def get_folder_structure_info(self, ward_id: int, tournament_name: str) -> Dict:
        """
        フォルダ構造の情報を取得（デバッグ用）

        Args:
            ward_id: 区ID
            tournament_name: 大会名

        Returns:
            フォルダ情報の辞書
        """
        ward_name = self.WARD_NAMES.get(ward_id, "不明")
        current_year = datetime.now().year

        return {
            "root_folder_id": self.ROOT_FOLDER_ID,
            "ward_name": ward_name,
            "year": f"{current_year}年",
            "tournament_name": tournament_name,
            "full_path": (
                f"大会申込システム/"
                f"登録申請書・大会申込書/"
                f"{ward_name}/"
                f"{current_year}年/"
                f"{tournament_name}/"
            )
        }
