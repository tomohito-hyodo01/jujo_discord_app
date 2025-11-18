"""
Excel編集サービス ファクトリー

区IDに応じて適切なExcelServiceを返す
"""
from services.excel_service_base import BaseExcelService
from services.wards.edogawa_excel_service import EdogawaExcelService


class ExcelServiceFactory:
    """区に応じた適切なExcelServiceを返すファクトリー"""

    # 区ID → サービスクラスのマッピング
    _services = {
        23: EdogawaExcelService,
        # 18: ArakawaExcelService,  # 今後追加
        # 17: KitaExcelService,     # 今後追加
    }

    @classmethod
    def create(cls, ward_id: int) -> BaseExcelService:
        """
        ward_idに応じたExcelServiceインスタンスを生成

        Args:
            ward_id: 区ID

        Returns:
            BaseExcelService: 該当区のExcelServiceインスタンス

        Raises:
            ValueError: 対応していない区の場合
        """
        service_class = cls._services.get(ward_id)

        if service_class is None:
            available_wards = ', '.join(str(w) for w in cls._services.keys())
            raise ValueError(
                f"Ward ID {ward_id} is not supported yet. "
                f"Available wards: {available_wards}"
            )

        return service_class()

    @classmethod
    def get_supported_wards(cls) -> list:
        """
        対応している区のリストを取得

        Returns:
            list: 対応している区IDのリスト
        """
        return list(cls._services.keys())
