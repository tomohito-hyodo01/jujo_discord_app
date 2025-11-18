"""
Discord ファイル送信サービス

大会申込ExcelファイルをDiscordチャンネルに送信
"""
import os
import json
import httpx
from typing import Dict, List, Tuple
from pathlib import Path


class DiscordFileService:
    """Discord ファイル送信サービス"""

    def __init__(self):
        """初期化"""
        self.bot_token = os.getenv("DISCORD_BOT_TOKEN")
        self.channel_id = os.getenv("EXCEL_DISCORD_CHANNEL_ID")

        if not self.bot_token:
            raise ValueError("DISCORD_BOT_TOKEN environment variable not set")

        if not self.channel_id:
            raise ValueError("EXCEL_DISCORD_CHANNEL_ID environment variable not set")

    async def upload_tournament_files(
        self,
        ward_id: int,
        tournament_name: str,
        file_paths: Dict[str, str]
    ) -> Dict[str, str]:
        """
        大会申込ExcelファイルをDiscordチャンネルにアップロード

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
                "member_registration": "https://cdn.discordapp.com/attachments/...",
                "individual_application": "https://cdn.discordapp.com/attachments/..."
            }
        """
        # メッセージ内容を作成
        ward_names = {
            17: "北区",
            18: "荒川区",
            23: "江戸川区",
        }
        ward_name = ward_names.get(ward_id, f"Ward {ward_id}")

        content = f"📊 **大会申込Excelファイル**\n\n"
        content += f"🏆 大会名: {tournament_name}\n"
        content += f"📍 区: {ward_name}\n"
        content += f"📅 生成日時: {self._get_current_time()}\n\n"

        # アップロードするファイルのリストを作成
        files_to_upload = []
        file_names = {}

        if "member_registration" in file_paths:
            file_path = file_paths["member_registration"]
            file_name = os.path.basename(file_path)
            files_to_upload.append((file_path, file_name))
            file_names["member_registration"] = file_name

        if "individual_application" in file_paths:
            file_path = file_paths["individual_application"]
            file_name = os.path.basename(file_path)
            files_to_upload.append((file_path, file_name))
            file_names["individual_application"] = file_name

        if not files_to_upload:
            raise ValueError("No files to upload")

        # Discordにファイルをアップロード
        message_data = await self._send_files_to_discord(content, files_to_upload)

        # アップロードされたファイルのURLを取得
        result = {}
        attachments = message_data.get("attachments", [])

        for attachment in attachments:
            filename = attachment.get("filename")
            url = attachment.get("url")

            if filename == file_names.get("member_registration"):
                result["member_registration"] = url
            elif filename == file_names.get("individual_application"):
                result["individual_application"] = url

        return result

    async def _send_files_to_discord(
        self,
        content: str,
        files: List[Tuple[str, str]]
    ) -> Dict:
        """
        Discord APIでファイルを送信

        Args:
            content: メッセージ内容
            files: [(file_path, file_name), ...] のリスト

        Returns:
            Discord APIのレスポンス（メッセージデータ）
        """
        url = f"https://discord.com/api/v10/channels/{self.channel_id}/messages"
        headers = {
            "Authorization": f"Bot {self.bot_token}"
        }

        # ファイルをマルチパートフォームデータとして準備
        files_data = []
        file_handles = []

        try:
            for idx, (file_path, file_name) in enumerate(files):
                if not Path(file_path).exists():
                    raise FileNotFoundError(f"File not found: {file_path}")

                f = open(file_path, 'rb')
                file_handles.append(f)
                files_data.append(
                    (f'files[{idx}]', (file_name, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
                )

            # payload_jsonを正しいJSON文字列に変換
            payload = {
                "content": content
            }
            data = {
                'payload_json': json.dumps(payload)
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    data=data,
                    files=files_data
                )

                if response.status_code not in [200, 201]:
                    raise Exception(f"Discord API error: {response.status_code} - {response.text}")

                response_data = response.json()

                # デバッグ: attachmentsのfilenameとURLをログ出力
                print("=== Discord API Response Debug ===")
                for attachment in response_data.get("attachments", []):
                    print(f"Filename: {attachment.get('filename')}")
                    print(f"URL: {attachment.get('url')}")
                    print(f"---")

                return response_data

        finally:
            # ファイルハンドルをクローズ
            for f in file_handles:
                f.close()

    def _get_current_time(self) -> str:
        """現在時刻を取得（日本時間）"""
        from datetime import datetime, timezone, timedelta

        jst = timezone(timedelta(hours=9))
        now = datetime.now(jst)
        return now.strftime("%Y年%m月%d日 %H:%M")
