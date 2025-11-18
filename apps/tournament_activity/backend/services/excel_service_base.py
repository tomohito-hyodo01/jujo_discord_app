"""
Excel編集サービス 基底クラス

全区共通の処理を定義
"""
from abc import ABC, abstractmethod
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import shutil


class BaseExcelService(ABC):
    """全区共通の基底クラス"""

    def __init__(self, ward_id: int, ward_name: str):
        """
        初期化

        Args:
            ward_id: 区ID
            ward_name: 区名
        """
        self.ward_id = ward_id
        self.ward_name = ward_name
        self.template_dir = Path(f"templates/wards/{ward_id}_{ward_name}")
        self.output_dir = Path("output")
        self.output_dir.mkdir(exist_ok=True)

    def generate_tournament_files(
        self,
        tournament: Dict,
        registrations: List[Dict]
    ) -> Dict[str, str]:
        """
        大会申込Excelファイルを生成（全区共通のエントリーポイント）

        Args:
            tournament: 大会情報 (tournament_mst)
            registrations: 申込データリスト (tournament_registration + player_mst)

        Returns:
            生成されたファイルパスの辞書
            {
                "member_registration": "output/会員登録表_xxx.xlsx",
                "individual_application": "output/個人戦申込書_xxx.xlsx"
            }
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        tournament_name = tournament['tournament_name']

        result = {}

        # 会員登録表の生成（各区で実装が異なる）
        member_file = self.generate_member_registration(
            tournament_name,
            registrations,
            timestamp
        )
        if member_file:
            result["member_registration"] = str(member_file)

        # 個人戦申込書の生成（各区で実装が異なる）
        individual_file = self.generate_individual_application(
            tournament,
            registrations,
            timestamp
        )
        if individual_file:
            result["individual_application"] = str(individual_file)

        return result

    def _copy_template(self, template_filename: str, output_filename: str) -> Path:
        """
        テンプレートファイルをコピー（共通処理）

        Args:
            template_filename: テンプレートファイル名（拡張子含む）
            output_filename: 出力ファイル名（拡張子含む）

        Returns:
            コピーされたファイルのパス
        """
        template_file = self.template_dir / template_filename
        output_path = self.output_dir / output_filename

        if not template_file.exists():
            raise FileNotFoundError(f"Template file not found: {template_file}")

        shutil.copy(template_file, output_path)
        return output_path

    # 各区で実装が必要な抽象メソッド
    @abstractmethod
    def generate_member_registration(
        self,
        tournament_name: str,
        registrations: List[Dict],
        timestamp: str
    ) -> Optional[Path]:
        """
        会員登録表を生成（各区で実装）

        Args:
            tournament_name: 大会名
            registrations: 申込データリスト
            timestamp: タイムスタンプ

        Returns:
            生成されたファイルパス（不要な場合はNone）
        """
        pass

    @abstractmethod
    def generate_individual_application(
        self,
        tournament: Dict,
        registrations: List[Dict],
        timestamp: str
    ) -> Optional[Path]:
        """
        個人戦申込書を生成（各区で実装）

        Args:
            tournament: 大会情報
            registrations: 申込データリスト
            timestamp: タイムスタンプ

        Returns:
            生成されたファイルパス（不要な場合はNone）
        """
        pass
